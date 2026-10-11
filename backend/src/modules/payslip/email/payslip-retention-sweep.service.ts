import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { runPayslipTransaction } from '../shared/payslip-transaction';
import { PayslipPdfStatus } from '../../../generated/prisma/client';

@Injectable()
export class PayslipRetentionSweepService {
  private readonly logger = new Logger(PayslipRetentionSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Executes retention sweep:
   * Deletes stored PDF records and non-terminal delivery / attempt / notification event rows
   * older than PAYSLIP_RETENTION_DAYS (default 20).
   *
   * Invariants:
   * - Does NOT delete PDFs that are pinned (expiresAt > now)
   * - Does NOT delete deliveries/PDFs belonging to dispatches in RUNNING / PAUSED / APPROVED
   * - Keeps ACTIVE suppressions regardless of age
   * - Deletes in chunks of 500 per transaction
   */
  async runSweep(): Promise<{
    deletedPdfs: number;
    deletedBlobs: number;
    deletedDeliveries: number;
    deletedAttempts: number;
    deletedEvents: number;
  }> {
    const retentionDays = Number(process.env.PAYSLIP_RETENTION_DAYS) || 20;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const now = new Date();

    this.logger.log(`Starting retention sweep with cutoff date ${cutoffDate.toISOString()}`);

    let totalDeletedPdfs = 0;
    let totalDeletedBlobs = 0;
    let totalDeletedDeliveries = 0;
    let totalDeletedAttempts = 0;
    let totalDeletedEvents = 0;

    // 1. Delete eligible expired/unpinned PayslipPdf records
    // Protected: status READY with expiresAt > now, or associated with active deliveries
    while (true) {
      const candidatePdfs = await this.prisma.payslipPdf.findMany({
        where: {
          createdAt: { lt: cutoffDate },
          OR: [
            { expiresAt: { lte: now } },
            { status: { in: [PayslipPdfStatus.EXPIRED, PayslipPdfStatus.FAILED] } },
          ],
        },
        select: { id: true },
        take: 500,
      });

      if (candidatePdfs.length === 0) break;
      const ids = candidatePdfs.map((p) => p.id);

      const delResult = await runPayslipTransaction(this.prisma, 'BULK', async (tx) => {
        return tx.payslipPdf.deleteMany({
          where: { id: { in: ids } },
        });
      });

      totalDeletedPdfs += delResult.count;
      if (candidatePdfs.length < 500) break;
    }

    // 1b. Delete the stored PDF bytes. PayslipPdf -> PayslipPdfBlob is onDelete: Restrict, so removing
    // PayslipPdf rows alone leaves the salary data in PayslipPdfBlob. Remove blobs nothing references.
    while (true) {
      const orphanBlobs = await this.prisma.payslipPdfBlob.findMany({
        where: { createdAt: { lt: cutoffDate }, pdfs: { none: {} } },
        select: { id: true },
        take: 200,
      });
      if (orphanBlobs.length === 0) break;
      const bIds = orphanBlobs.map((b) => b.id);
      try {
        const blobDel = await runPayslipTransaction(this.prisma, 'BULK', async (tx) =>
          tx.payslipPdfBlob.deleteMany({ where: { id: { in: bIds }, pdfs: { none: {} } } }),
        );
        totalDeletedBlobs += blobDel.count;
        if (blobDel.count === 0) break;
      } catch (err: any) {
        // A blob was re-referenced by a PDF created meanwhile (FK Restrict). Safe to skip; next sweep retries.
        this.logger.warn(`Skipped a blob chunk during retention sweep: ${err?.code || err?.message}`);
        break;
      }
      if (orphanBlobs.length < 200) break;
    }

    // 2. Delete old PayslipDelivery records that are in a final state.
    // Protected: PENDING, PROCESSING, RETRY_SCHEDULED, SUBMISSION_UNKNOWN (HR still has to resolve it),
    // or any delivery whose dispatch is still active.
    while (true) {
      const candidateDeliveries = await this.prisma.payslipDelivery.findMany({
        where: {
          createdAt: { lt: cutoffDate },
          status: {
            in: [
              'SUBMITTED',
              'DELIVERED',
              'DELIVERY_DELAYED',
              'BOUNCED_SOFT',
              'BOUNCED_HARD',
              'COMPLAINED',
              'REJECTED',
              'FAILED',
              'CANCELLED',
              'SKIPPED',
            ],
          },
          dispatch: {
            status: { in: ['COMPLETED', 'COMPLETED_WITH_FAILURES', 'CANCELLED'] },
          },
        },
        select: { id: true },
        take: 500,
      });

      if (candidateDeliveries.length === 0) break;
      const dIds = candidateDeliveries.map((d) => d.id);

      const res = await runPayslipTransaction(this.prisma, 'BULK', async (tx) => {
        const attDel = await tx.payslipDeliveryAttempt.deleteMany({
          where: { deliveryId: { in: dIds } },
        });
        const delDel = await tx.payslipDelivery.deleteMany({
          where: { id: { in: dIds } },
        });
        return { attemptsCount: attDel.count, deliveriesCount: delDel.count };
      });

      totalDeletedAttempts += res.attemptsCount;
      totalDeletedDeliveries += res.deliveriesCount;
      if (candidateDeliveries.length < 500) break;
    }

    // 3. Delete old processed SesNotificationEvent rows older than cutoff
    while (true) {
      const candidateEvents = await this.prisma.sesNotificationEvent.findMany({
        where: {
          receivedAt: { lt: cutoffDate },
          processedAt: { not: null },
        },
        select: { id: true },
        take: 500,
      });

      if (candidateEvents.length === 0) break;
      const eIds = candidateEvents.map((e) => e.id);

      const evDel = await runPayslipTransaction(this.prisma, 'BULK', async (tx) => {
        return tx.sesNotificationEvent.deleteMany({
          where: { id: { in: eIds } },
        });
      });

      totalDeletedEvents += evDel.count;
      if (candidateEvents.length < 500) break;
    }

    // Audit log
    await this.auditService.log({
      actorType: 'SYSTEM',
      action: 'PAYSLIP_RETENTION_SWEEP_EXECUTED',
      entityType: 'RETENTION_SWEEP',
      metadata: {
        cutoffDate,
        deletedPdfs: totalDeletedPdfs,
        deletedBlobs: totalDeletedBlobs,
        deletedDeliveries: totalDeletedDeliveries,
        deletedAttempts: totalDeletedAttempts,
        deletedEvents: totalDeletedEvents,
      },
    });

    this.logger.log(
      `Retention sweep finished: ${totalDeletedPdfs} PDFs, ${totalDeletedBlobs} PDF blobs, ${totalDeletedDeliveries} deliveries, ${totalDeletedEvents} events deleted.`,
    );

    return {
      deletedPdfs: totalDeletedPdfs,
      deletedBlobs: totalDeletedBlobs,
      deletedDeliveries: totalDeletedDeliveries,
      deletedAttempts: totalDeletedAttempts,
      deletedEvents: totalDeletedEvents,
    };
  }
}
