import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PayslipEmailSenderService } from './payslip-email-sender.service';
import {
  PayslipDeliveryAttemptTrigger,
  PayslipDeliveryStatus,
  PayslipEmailDispatchStatus,
} from '../../../generated/prisma/client';

const MAX_AUTO_RETRIES = 3;
// Backoff delays in milliseconds: 1m, 5m, 15m
const RETRY_BACKOFF_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];

@Injectable()
export class PayslipDeliveryWorkerService implements OnModuleInit {
  private readonly logger = new Logger(PayslipDeliveryWorkerService.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: PayslipEmailSenderService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.recoverStuckProcessing();
  }

  /**
   * Resets deliveries stuck in PROCESSING for > 5 minutes back to PENDING.
   */
  async recoverStuckProcessing(): Promise<void> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = await this.prisma.payslipDelivery.updateMany({
        where: {
          status: PayslipDeliveryStatus.PROCESSING,
          updatedAt: { lt: fiveMinutesAgo },
        },
        data: {
          status: PayslipDeliveryStatus.PENDING,
          claimedAt: null,
          claimedBy: null,
        },
      });

      if (result.count > 0) {
        this.logger.warn(`Recovered ${result.count} stuck PROCESSING deliveries back to PENDING.`);
      }
    } catch (err: any) {
      this.logger.error(`Error recovering stuck PROCESSING deliveries: ${err?.message}`);
    }
  }

  /**
   * Process a single batch of eligible deliveries.
   * Can be triggered on dispatch approval, cron/heartbeat, or manual retry.
   */
  async processNextDeliveries(limit = 20): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }
    this.isProcessing = true;

    try {
      const now = new Date();

      // Find deliveries that belong to active dispatches and are ready for processing
      // Status can be PENDING or RETRY_SCHEDULED where nextAttemptAt <= now
      const eligibleDeliveries = await this.prisma.payslipDelivery.findMany({
        where: {
          status: {
            in: [PayslipDeliveryStatus.PENDING, PayslipDeliveryStatus.RETRY_SCHEDULED],
          },
          OR: [
            { nextAttemptAt: null },
            { nextAttemptAt: { lte: now } },
          ],
          dispatch: {
            status: { in: [PayslipEmailDispatchStatus.APPROVED, PayslipEmailDispatchStatus.SENDING] },
          },
        },
        take: limit,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          dispatchId: true,
          autoRetryCount: true,
          status: true,
        },
      });

      if (eligibleDeliveries.length === 0) {
        return 0;
      }

      // Mark their dispatches as SENDING if they were APPROVED
      const dispatchIds = Array.from(new Set(eligibleDeliveries.map((d) => d.dispatchId).filter(Boolean))) as string[];
      if (dispatchIds.length > 0) {
        await this.prisma.payslipEmailDispatch.updateMany({
          where: {
            id: { in: dispatchIds },
            status: PayslipEmailDispatchStatus.APPROVED,
          },
          data: {
            status: PayslipEmailDispatchStatus.SENDING,
          },
        });
      }

      let processedCount = 0;

      for (const item of eligibleDeliveries) {
        // Mark as PROCESSING with lock
        const claimed = await this.prisma.payslipDelivery.updateMany({
          where: {
            id: item.id,
            status: item.status,
          },
          data: {
            status: PayslipDeliveryStatus.PROCESSING,
            claimedAt: new Date(),
            claimedBy: 'delivery-worker',
          },
        });

        if (claimed.count === 0) {
          // Already grabbed by another worker
          continue;
        }

        const result = await this.sender.sendDelivery(
          item.id,
          PayslipDeliveryAttemptTrigger.AUTOMATIC,
        );

        processedCount++;

        // If outcome was failure, schedule retry if under max attempts
        if (result.outcome !== 'ACCEPTED') {
          const currentDelivery = await this.prisma.payslipDelivery.findUnique({
            where: { id: item.id },
            select: { autoRetryCount: true, status: true },
          });

          if (currentDelivery && currentDelivery.status !== PayslipDeliveryStatus.SKIPPED) {
            const nextRetryIndex = currentDelivery.autoRetryCount;
            if (nextRetryIndex < MAX_AUTO_RETRIES) {
              const delay = RETRY_BACKOFF_MS[nextRetryIndex] || 15 * 60 * 1000;
              await this.prisma.payslipDelivery.update({
                where: { id: item.id },
                data: {
                  status: PayslipDeliveryStatus.RETRY_SCHEDULED,
                  autoRetryCount: { increment: 1 },
                  nextAttemptAt: new Date(Date.now() + delay),
                },
              });
            } else {
              // Exceeded max retries
              await this.prisma.payslipDelivery.update({
                where: { id: item.id },
                data: {
                  status: PayslipDeliveryStatus.FAILED,
                  nextAttemptAt: null,
                },
              });
            }
          }
        }
      }

      // Check if dispatches have completed
      for (const dId of dispatchIds) {
        await this.updateDispatchStatusIfFinished(dId);
      }

      return processedCount;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Updates dispatch status to COMPLETED or COMPLETED_WITH_FAILURES if all deliveries are in a terminal state.
   */
  async updateDispatchStatusIfFinished(dispatchId: string): Promise<void> {
    const counts = await this.prisma.payslipDelivery.groupBy({
      by: ['status'],
      where: { dispatchId },
      _count: { id: true },
    });

    const activeStatuses: PayslipDeliveryStatus[] = [
      PayslipDeliveryStatus.PENDING,
      PayslipDeliveryStatus.PROCESSING,
      PayslipDeliveryStatus.RETRY_SCHEDULED,
    ];

    const hasActive = counts.some((c) => activeStatuses.includes(c.status));
    if (hasActive) {
      return;
    }

    const hasFailures = counts.some((c) =>
      [
        PayslipDeliveryStatus.FAILED,
        PayslipDeliveryStatus.BOUNCED_HARD,
        PayslipDeliveryStatus.REJECTED,
      ].includes(c.status),
    );

    await this.prisma.payslipEmailDispatch.update({
      where: { id: dispatchId },
      data: {
        status: hasFailures
          ? PayslipEmailDispatchStatus.COMPLETED_WITH_FAILURES
          : PayslipEmailDispatchStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }
}
