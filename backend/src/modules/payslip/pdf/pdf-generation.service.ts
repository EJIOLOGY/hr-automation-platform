import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipApprovalContext, PayslipPostApprovalHook } from '../shared/post-approval-hook';
import { PdfService } from './pdf.service';
import { PayslipRenderService } from './payslip-render.service';
import { PostgresPayslipPdfStorage } from './payslip-pdf-storage';
import { templateVersion } from './payslip.template';
import { PayslipPdfStatus, PayslipStatus } from '../../../generated/prisma/client';
import {
  PayslipPdfGenerationRequester,
  PayslipPdfNotReadyResult,
  PayslipPdfReader,
  PayslipPdfReaderResult,
  PayslipPdfRetentionPin,
} from './payslip-pdf-reader.interface';

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETENTION_DAYS = 20;
const DEFAULT_PIN_DAYS = 3;

export interface BatchPdfStatusSummary {
  total: number;
  approved: number;
  pending: number;
  generating: number;
  ready: number;
  failed: number;
  expired: number;
  failures: Array<{
    payslipId: string;
    staffId: string;
    errorMessage: string | null;
    attempts: number;
  }>;
}

@Injectable()
export class PdfGenerationService
  extends PayslipPdfReader
  implements
    PayslipPostApprovalHook,
    PayslipPdfGenerationRequester,
    PayslipPdfRetentionPin,
    OnModuleInit
{
  private readonly logger = new Logger(PdfGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly renderService: PayslipRenderService,
    private readonly storage: PostgresPayslipPdfStorage,
    private readonly audit: AuditService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.recoverStuckGenerating();
  }

  /**
   * Resumability / crash recovery: on startup, any payslip left GENERATING
   * for > 5 minutes is reset to PENDING.
   */
  async recoverStuckGenerating(): Promise<void> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = await this.prisma.payslipPdf.updateMany({
        where: {
          status: PayslipPdfStatus.GENERATING,
          updatedAt: { lt: fiveMinutesAgo },
        },
        data: {
          status: PayslipPdfStatus.PENDING,
        },
      });
      if (result.count > 0) {
        this.logger.warn(`Recovered ${result.count} stuck GENERATING payslip PDFs to PENDING.`);
      }
    } catch (err: any) {
      this.logger.error(`Error recovering stuck GENERATING PDFs: ${err?.message}`);
    }
  }

  /**
   * Post-approval hook: called automatically after a batch approval commits.
   */
  async onApproved(ctx: PayslipApprovalContext): Promise<void> {
    if (!ctx.payslipIds || ctx.payslipIds.length === 0) return;
    this.logger.log(`Post-approval PDF hook triggered for batch ${ctx.batchId} (${ctx.payslipIds.length} payslips).`);
    // Enqueue generation asynchronously
    void this.enqueueAndProcess(ctx.payslipIds);
  }

  /**
   * PayslipPdfGenerationRequester implementation: idempotent enqueue.
   */
  async request(payslipIds: string[]): Promise<void> {
    if (!payslipIds || payslipIds.length === 0) return;
    void this.enqueueAndProcess(payslipIds);
  }

  /**
   * PayslipPdfRetentionPin implementation: raises expiresAt to at least now + minDays.
   */
  async pin(payslipIds: string[], minDays = DEFAULT_PIN_DAYS): Promise<void> {
    if (!payslipIds || payslipIds.length === 0) return;
    const targetExpiresAt = new Date(Date.now() + minDays * 24 * 60 * 60 * 1000);
    await this.prisma.payslipPdf.updateMany({
      where: {
        payslipId: { in: payslipIds },
        status: PayslipPdfStatus.READY,
        expiresAt: { lt: targetExpiresAt },
      },
      data: {
        expiresAt: targetExpiresAt,
      },
    });
  }

  /**
   * PayslipPdfReader implementation: read-only access to ready PDF bytes.
   */
  async getReady(payslipId: string): Promise<PayslipPdfReaderResult> {
    const record = await this.prisma.payslipPdf.findUnique({
      where: { payslipId },
      include: { blob: true },
    });

    if (!record) {
      return { status: 'PENDING' };
    }

    if (record.status !== PayslipPdfStatus.READY || !record.blob) {
      return { status: record.status as PayslipPdfNotReadyResult['status'] };
    }

    return {
      status: 'READY',
      bytes: Buffer.from(record.blob.bytes),
      sha256: record.blob.sha256,
      sizeBytes: record.blob.sizeBytes,
    };
  }

  /**
   * Ensures PayslipPdf records exist for given payslipIds, then processes them.
   */
  async enqueueAndProcess(payslipIds: string[]): Promise<void> {
    const retentionDays = Number(process.env.PAYSLIP_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);

    // Fetch the payslips
    const payslips = await this.prisma.payslip.findMany({
      where: {
        id: { in: payslipIds },
        status: PayslipStatus.APPROVED,
      },
      select: {
        id: true,
        contentHash: true,
        carriedForward: true,
      },
    });

    for (const payslip of payslips) {
      // Carried forward payslips can reuse existing blob immediately without rendering
      if (payslip.carriedForward && payslip.contentHash) {
        const existingBlob = await this.storage.getByHash(payslip.contentHash, templateVersion);
        if (existingBlob) {
          const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
          await this.prisma.payslipPdf.upsert({
            where: { payslipId: payslip.id },
            create: {
              payslipId: payslip.id,
              status: PayslipPdfStatus.READY,
              blobId: existingBlob.id,
              generatedAt: new Date(),
              expiresAt,
            },
            update: {
              status: PayslipPdfStatus.READY,
              blobId: existingBlob.id,
              generatedAt: new Date(),
              expiresAt,
              errorMessage: null,
            },
          });
          continue;
        }
      }

      // Upsert to PENDING if not already READY
      await this.prisma.payslipPdf.upsert({
        where: { payslipId: payslip.id },
        create: {
          payslipId: payslip.id,
          status: PayslipPdfStatus.PENDING,
        },
        update: {
          // If FAILED or EXPIRED, re-queue as PENDING
          ...(payslip.id ? {} : {}),
        },
      });
    }

    // Process pending records
    await this.processQueue(payslipIds);
  }

  /**
   * Concurrency-limited background generation loop.
   */
  async processQueue(payslipIds?: string[]): Promise<void> {
    const concurrency = Math.max(1, Number(process.env.PAYSLIP_PDF_CONCURRENCY ?? DEFAULT_CONCURRENCY));
    const maxAttempts = Number(process.env.PAYSLIP_PDF_MAX_ATTEMPTS ?? DEFAULT_MAX_ATTEMPTS);
    const retentionDays = Number(process.env.PAYSLIP_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);

    // Fetch eligible PENDING records
    const records = await this.prisma.payslipPdf.findMany({
      where: {
        status: PayslipPdfStatus.PENDING,
        attempts: { lt: maxAttempts },
        ...(payslipIds && payslipIds.length > 0 ? { payslipId: { in: payslipIds } } : {}),
      },
      select: {
        id: true,
        payslipId: true,
        attempts: true,
      },
    });

    if (records.length === 0) return;

    // Simple chunked worker pool
    const queue = [...records];
    const workers: Promise<void>[] = [];

    const runWorker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        // Transition to GENERATING
        await this.prisma.payslipPdf.update({
          where: { id: item.id },
          data: {
            status: PayslipPdfStatus.GENERATING,
            attempts: { increment: 1 },
          },
        });

        try {
          const htmlData = await this.renderService.getPayslipData(item.payslipId);
          const pdfBuffer = await this.pdfService.generatePayslipPdf(htmlData);

          // Get payslip contentHash
          const payslip = await this.prisma.payslip.findUnique({
            where: { id: item.payslipId },
            select: { contentHash: true },
          });

          const contentHash = payslip?.contentHash ?? 'unhashed';
          const blob = await this.storage.put(contentHash, templateVersion, pdfBuffer);
          const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

          await this.prisma.payslipPdf.update({
            where: { id: item.id },
            data: {
              status: PayslipPdfStatus.READY,
              blobId: blob.id,
              generatedAt: new Date(),
              expiresAt,
              errorMessage: null,
            },
          });
        } catch (err: any) {
          const sanitisedMessage = (err?.message ?? 'Unknown PDF render error').slice(0, 300);
          this.logger.error(`Failed to generate PDF for payslip ${item.payslipId}: ${sanitisedMessage}`);

          await this.prisma.payslipPdf.update({
            where: { id: item.id },
            data: {
              status: PayslipPdfStatus.FAILED,
              errorMessage: sanitisedMessage,
            },
          });
        }
      }
    };

    for (let i = 0; i < concurrency; i++) {
      workers.push(runWorker());
    }

    await Promise.all(workers);
  }

  /**
   * Generates and stores a PDF for a single approved payslip on-demand (lazy store).
   */
  async renderAndStoreSingle(payslipId: string): Promise<Buffer> {
    const retentionDays = Number(process.env.PAYSLIP_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
    const htmlData = await this.renderService.getPayslipData(payslipId);
    const pdfBuffer = await this.pdfService.generatePayslipPdf(htmlData);

    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      select: { contentHash: true },
    });

    const contentHash = payslip?.contentHash ?? 'unhashed';
    const blob = await this.storage.put(contentHash, templateVersion, pdfBuffer);
    const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

    await this.prisma.payslipPdf.upsert({
      where: { payslipId },
      create: {
        payslipId,
        status: PayslipPdfStatus.READY,
        blobId: blob.id,
        generatedAt: new Date(),
        expiresAt,
      },
      update: {
        status: PayslipPdfStatus.READY,
        blobId: blob.id,
        generatedAt: new Date(),
        expiresAt,
        errorMessage: null,
      },
    });

    return pdfBuffer;
  }

  /**
   * Status summary for a batch.
   */
  async getBatchPdfStatus(batchId: string): Promise<BatchPdfStatusSummary> {
    const payslips = await this.prisma.payslip.findMany({
      where: { payslipBatchId: batchId },
      select: {
        id: true,
        staffId: true,
        status: true,
        pdf: {
          select: {
            status: true,
            errorMessage: true,
            attempts: true,
          },
        },
      },
    });

    const total = payslips.length;
    let approved = 0;
    let pending = 0;
    let generating = 0;
    let ready = 0;
    let failed = 0;
    let expired = 0;
    const failures: BatchPdfStatusSummary['failures'] = [];

    for (const p of payslips) {
      if (p.status === PayslipStatus.APPROVED) {
        approved++;
      }

      const pdfStatus = p.pdf?.status;
      if (pdfStatus === PayslipPdfStatus.READY) {
        ready++;
      } else if (pdfStatus === PayslipPdfStatus.GENERATING) {
        generating++;
      } else if (pdfStatus === PayslipPdfStatus.FAILED) {
        failed++;
        if (failures.length < 100) {
          failures.push({
            payslipId: p.id,
            staffId: p.staffId,
            errorMessage: p.pdf?.errorMessage ?? null,
            attempts: p.pdf?.attempts ?? 0,
          });
        }
      } else if (pdfStatus === PayslipPdfStatus.EXPIRED) {
        expired++;
      } else {
        // PENDING or no pdf record yet
        pending++;
      }
    }

    return {
      total,
      approved,
      pending,
      generating,
      ready,
      failed,
      expired,
      failures,
    };
  }

  /**
   * Re-queues PENDING and FAILED (and EXPIRED) PDFs for approved payslips in a batch.
   */
  async reenqueueBatch(batchId: string): Promise<BatchPdfStatusSummary> {
    const approvedPayslips = await this.prisma.payslip.findMany({
      where: {
        payslipBatchId: batchId,
        status: PayslipStatus.APPROVED,
      },
      select: { id: true },
    });

    const ids = approvedPayslips.map((p) => p.id);

    // Reset FAILED or EXPIRED to PENDING with attempts = 0
    await this.prisma.payslipPdf.updateMany({
      where: {
        payslipId: { in: ids },
        status: { in: [PayslipPdfStatus.FAILED, PayslipPdfStatus.EXPIRED] },
      },
      data: {
        status: PayslipPdfStatus.PENDING,
        attempts: 0,
        errorMessage: null,
      },
    });

    // Enqueue
    await this.enqueueAndProcess(ids);

    return this.getBatchPdfStatus(batchId);
  }
}
