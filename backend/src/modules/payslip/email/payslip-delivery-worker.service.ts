import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PayslipEmailSenderService, SendOutcome } from './payslip-email-sender.service';
import { DispatchHealthService } from './dispatch-health.service';
import {
  PayslipDeliveryAttemptTrigger,
  PayslipDeliveryStatus,
  PayslipEmailDispatchStatus,
} from '../../../generated/prisma/client';
import { runPayslipTransaction } from '../shared/payslip-transaction';

const MAX_AUTO_RETRIES = 3;
// Backoff delays: attempt 1 -> 60s, attempt 2 -> 300s (5m), attempt 3 -> 900s (15m)
const RETRY_BACKOFF_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];

@Injectable()
export class PayslipDeliveryWorkerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(PayslipDeliveryWorkerService.name);
  private isRunning = false;
  private shouldStop = false;
  private readonly instanceId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: PayslipEmailSenderService,
    private readonly healthService: DispatchHealthService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recoverStuckProcessing();

    const enabled = process.env.PAYSLIP_WORKER_ENABLED !== 'false';
    if (enabled) {
      this.startPollingLoop();
    } else {
      this.logger.log('PAYSLIP_WORKER_ENABLED is false; delivery worker polling loop disabled.');
    }
  }

  onApplicationShutdown(): void {
    this.shouldStop = true;
    this.logger.log('Shutting down delivery worker loop.');
  }

  /**
   * Resets deliveries stuck in PROCESSING for > PAYSLIP_PROCESSING_TIMEOUT_SECONDS (default 300)
   * to SUBMISSION_UNKNOWN (at-most-once delivery: never returned to PENDING).
   */
  async recoverStuckProcessing(): Promise<void> {
    try {
      const timeoutSec = Number(process.env.PAYSLIP_PROCESSING_TIMEOUT_SECONDS) || 300;
      const timeoutAgo = new Date(Date.now() - timeoutSec * 1000);

      const result = await this.prisma.payslipDelivery.updateMany({
        where: {
          status: PayslipDeliveryStatus.PROCESSING,
          claimedAt: { lt: timeoutAgo },
        },
        data: {
          status: PayslipDeliveryStatus.SUBMISSION_UNKNOWN,
          claimedAt: null,
          claimedBy: null,
          lastErrorCode: 'PROCESSING_TIMEOUT_RECOVERED',
          lastErrorMessage: `Delivery was stuck in PROCESSING for more than ${timeoutSec} seconds. Marked SUBMISSION_UNKNOWN.`,
        },
      });

      if (result.count > 0) {
        this.logger.warn(
          `Recovered ${result.count} stuck PROCESSING deliveries as SUBMISSION_UNKNOWN.`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Error recovering stuck PROCESSING deliveries: ${err?.message}`,
      );
    }
  }

  /**
   * Polling loop running while application is active.
   */
  private startPollingLoop(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.shouldStop = false;

    void (async () => {
      this.logger.log(`Delivery worker polling loop started (instance: ${this.instanceId}).`);
      const idleMs = Number(process.env.PAYSLIP_WORKER_IDLE_MS) || 5000;

      while (!this.shouldStop) {
        try {
          const processedCount = await this.claimAndProcessBatch(1);
          if (processedCount === 0) {
            await this.sleep(idleMs);
          }
        } catch (err: any) {
          this.logger.error(`Error in delivery worker loop: ${err?.message || err}`);
          // Jittered backoff on unexpected infrastructure errors
          const jitter = Math.floor(Math.random() * 2000) + 1000;
          await this.sleep(jitter);
        }
      }
      this.isRunning = false;
      this.logger.log('Delivery worker polling loop stopped.');
    })();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Claims a batch of deliveries with FOR UPDATE SKIP LOCKED and processes them.
   */
  async claimAndProcessBatch(batchSize = 1): Promise<number> {
    // 1. Claim items atomically using FOR UPDATE SKIP LOCKED in a short ROW transaction
    const claimedRows = await runPayslipTransaction(this.prisma, 'ROW', async (tx) => {
      // Find candidate IDs
      const rawCandidates = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT d.id
         FROM "PayslipDelivery" d
         JOIN "PayslipEmailDispatch" ped ON d."dispatchId" = ped.id
         WHERE (d.status = 'PENDING' OR d.status = 'RETRY_SCHEDULED')
           AND (d."nextAttemptAt" IS NULL OR d."nextAttemptAt" <= NOW())
           AND (ped.status = 'APPROVED' OR ped.status = 'SENDING')
         ORDER BY d."nextAttemptAt" ASC NULLS FIRST, d.id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1`,
        batchSize,
      );

      if (!rawCandidates || rawCandidates.length === 0) {
        return [];
      }

      const ids = rawCandidates.map((c) => c.id);

      await tx.$executeRawUnsafe(
        `UPDATE "PayslipDelivery"
         SET status = 'PROCESSING', "claimedAt" = NOW(), "claimedBy" = $1
         WHERE id = ANY($2::text[])`,
        this.instanceId,
        ids,
      );

      return ids;
    });

    if (!claimedRows || claimedRows.length === 0) {
      return 0;
    }

    // Process claimed deliveries outside the transaction (Rule 15: no network calls inside transactions)
    for (const deliveryId of claimedRows) {
      await this.processSingleDelivery(deliveryId);
    }

    return claimedRows.length;
  }

  /**
   * Processes a claimed delivery.
   */
  private async processSingleDelivery(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.payslipDelivery.findUnique({
      where: { id: deliveryId },
      include: { dispatch: true },
    });

    if (!delivery) return;

    // If dispatch is PAUSED or CANCELLED, handle accordingly
    if (delivery.dispatch && delivery.dispatch.status === 'PAUSED') {
      await this.prisma.payslipDelivery.update({
        where: { id: deliveryId },
        data: {
          status: PayslipDeliveryStatus.PENDING,
          claimedAt: null,
          claimedBy: null,
        },
      });
      return;
    }

    if (delivery.dispatch && delivery.dispatch.status === 'CANCELLED') {
      await this.prisma.payslipDelivery.update({
        where: { id: deliveryId },
        data: {
          status: PayslipDeliveryStatus.CANCELLED,
          claimedAt: null,
          claimedBy: null,
        },
      });
      return;
    }

    // Mark dispatch as SENDING if it was APPROVED
    if (delivery.dispatchId && delivery.dispatch?.status === 'APPROVED') {
      await this.prisma.payslipEmailDispatch.update({
        where: { id: delivery.dispatchId },
        data: { status: PayslipEmailDispatchStatus.SENDING },
      });
    }

    // Execute send
    const outcome = await this.sender.sendDelivery(
      deliveryId,
      PayslipDeliveryAttemptTrigger.AUTOMATIC,
    );

    // Apply outcome & retry logic per A3.3 table
    await this.applyOutcome(deliveryId, delivery.dispatchId, outcome);

    // Record circuit breaker & health check
    if (delivery.dispatchId) {
      await this.healthService.recordOutcomeAndCheckCircuitBreaker(delivery.dispatchId, outcome);
      await this.healthService.checkBounceAndComplaintRates(delivery.dispatchId);
      await this.updateDispatchStatusIfFinished(delivery.dispatchId);
    }
  }

  /**
   * Applies delivery status changes per outcome table (A3.3).
   */
  async applyOutcome(
    deliveryId: string,
    dispatchId: string | null,
    outcome: SendOutcome,
  ): Promise<void> {
    const delivery = await this.prisma.payslipDelivery.findUnique({
      where: { id: deliveryId },
      select: { autoRetryCount: true },
    });
    const currentRetries = delivery?.autoRetryCount ?? 0;

    switch (outcome.kind) {
      case 'ACCEPTED':
        // Handled inside sender: status = SUBMITTED
        break;

      case 'TRANSIENT':
        if (currentRetries < MAX_AUTO_RETRIES) {
          const delay = RETRY_BACKOFF_MS[currentRetries] || 15 * 60 * 1000;
          await this.prisma.payslipDelivery.update({
            where: { id: deliveryId },
            data: {
              status: PayslipDeliveryStatus.RETRY_SCHEDULED,
              autoRetryCount: { increment: 1 },
              nextAttemptAt: new Date(Date.now() + delay),
              claimedAt: null,
              claimedBy: null,
            },
          });
        } else {
          await this.prisma.payslipDelivery.update({
            where: { id: deliveryId },
            data: {
              status: PayslipDeliveryStatus.FAILED,
              nextAttemptAt: null,
              claimedAt: null,
              claimedBy: null,
            },
          });
        }
        break;

      case 'PERMANENT':
        await this.prisma.payslipDelivery.update({
          where: { id: deliveryId },
          data: {
            status: PayslipDeliveryStatus.FAILED,
            nextAttemptAt: null,
            claimedAt: null,
            claimedBy: null,
          },
        });
        break;

      case 'SUPPRESSED':
        await this.prisma.payslipDelivery.update({
          where: { id: deliveryId },
          data: {
            status: PayslipDeliveryStatus.FAILED,
            skipReason: 'SUPPRESSED',
            nextAttemptAt: null,
            claimedAt: null,
            claimedBy: null,
          },
        });
        break;

      case 'UNKNOWN':
        await this.prisma.payslipDelivery.update({
          where: { id: deliveryId },
          data: {
            status: PayslipDeliveryStatus.SUBMISSION_UNKNOWN,
            nextAttemptAt: null,
            claimedAt: null,
            claimedBy: null,
          },
        });
        break;

      case 'ACCOUNT_PAUSED':
      case 'CONFIG_ERROR':
        // Return to PENDING without consuming an attempt, pause the whole dispatch
        await this.prisma.payslipDelivery.update({
          where: { id: deliveryId },
          data: {
            status: PayslipDeliveryStatus.PENDING,
            nextAttemptAt: null,
            claimedAt: null,
            claimedBy: null,
          },
        });
        if (dispatchId) {
          await this.prisma.payslipEmailDispatch.update({
            where: { id: dispatchId },
            data: {
              status: 'PAUSED',
              pauseReason: outcome.code || outcome.kind,
            },
          });
        }
        break;
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

    const failureStatuses: PayslipDeliveryStatus[] = [
      PayslipDeliveryStatus.FAILED,
      PayslipDeliveryStatus.BOUNCED_HARD,
      PayslipDeliveryStatus.REJECTED,
      PayslipDeliveryStatus.SUBMISSION_UNKNOWN,
    ];
    const hasFailures = counts.some((c) => failureStatuses.includes(c.status));

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

  /**
   * For backwards-compatibility with triggers.
   */
  async processNextDeliveries(limit = 5): Promise<number> {
    return this.claimAndProcessBatch(limit);
  }
}
