import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  PayslipBatchStatus,
  PayslipStatus,
  Prisma,
} from '../../../generated/prisma/client';
import { calculatePayslip } from '../calculation/calculation-engine';
import { loadAllowanceDefinitions } from '../calculation/allowance-metadata';
import { replacePayslipLines } from '../calculation/payslip-lines';
import type { CalculationInputs } from '../calculation/calculation.types';
import { payslipError } from '../shared/payslip-error-codes';
import { payslipAuditMetadata } from '../shared/payslip-audit';
import { runPayslipTransaction } from '../shared/payslip-transaction';
import { ReviewDecisionService } from './review-decision.service';
import { computeBatchStateHash, ReviewActor } from './review-workbook.service';
import {
  analyseReviewWorkbook,
  applyEditToInputs,
  loadReviewWorkbook,
  readWorkbookMeta,
  type AnalysedRow,
  type PlannedDecision,
  type PlannedEdit,
  type WorkbookError,
  type WorkbookSummary,
} from './review-workbook-analysis';

export interface WorkbookPreviewResult {
  previewId: string | null;
  applicable: boolean;
  expiresAt: Date | null;
  batchStateHash: string;
  summary: WorkbookSummary;
  rows: AnalysedRow[];
  errors: WorkbookError[];
}

export interface WorkbookApplyResult {
  applied: true;
  previewId: string;
  batchId: string;
  batchStatus: string;
  correctionBatchId: string | null;
  correctionVersion: number | null;
  counts: {
    recalculated: number;
    decisions: number;
    correctionPayslips: number;
  };
  statusCounts: Record<
    'CALCULATED' | 'IN_REVIEW' | 'HELD' | 'REJECTED' | 'APPROVED',
    number
  >;
}

/** What a preview stores: the validated plan, never the uploaded file. Apply recomputes from this plan. */
interface PreviewPayload {
  version: 2;
  edits: PlannedEdit[];
  decisions: PlannedDecision[];
}

const PREVIEW_TTL_MS = 30 * 60 * 1000;
const MAX_PREVIEW_ROWS = 1000;
const REVIEWABLE: PayslipBatchStatus[] = [
  PayslipBatchStatus.CALCULATED,
  PayslipBatchStatus.IN_REVIEW,
  PayslipBatchStatus.PARTIALLY_APPROVED,
];

const PAYSLIP_STATE_SELECT = {
  id: true,
  staffId: true,
  status: true,
  updatedAt: true,
  reviewedAt: true,
  calculationInputs: true,
  calculationOutputs: true,
} as const;

/** Thrown inside the apply transaction when a concurrent apply already consumed the preview. */
class PreviewAlreadyApplied extends Error {}

@Injectable()
export class ReviewWorkbookPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reviewDecisionService: ReviewDecisionService,
  ) {}

  /**
   * Step 1: validate the uploaded workbook against the batch it was exported from, recalculate any edited payslip in
   * memory and report every problem at once. Nothing is changed. A valid plan is stored as a 30-minute preview.
   */
  async previewWorkbook(
    batchId: string,
    buffer: Buffer,
    actor: ReviewActor,
  ): Promise<WorkbookPreviewResult> {
    const batch = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
      include: { payslips: { select: PAYSLIP_STATE_SELECT } },
    });
    if (!batch) throw new NotFoundException(`Batch ${batchId} not found.`);

    await this.assertLatestAndReviewable(this.prisma, batch);

    const workbook = await loadReviewWorkbook(buffer);
    const meta = readWorkbookMeta(workbook);

    if (meta.batchId !== batchId || meta.batchVersion !== batch.version) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'WORKBOOK_WRONG_BATCH',
        'This workbook was exported for a different batch or version. Export a fresh workbook for this batch.',
      );
    }
    const exportRow = await this.prisma.reviewWorkbook.findUnique({
      where: { exportHash: meta.exportHash },
      select: { id: true, payslipBatchId: true },
    });
    if (!exportRow || exportRow.payslipBatchId !== batchId) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'WORKBOOK_UNKNOWN_EXPORT',
        'This workbook was not exported by the system for this batch. Export a fresh workbook.',
      );
    }
    const batchStateHash = computeBatchStateHash(batch.payslips);
    if (batchStateHash !== meta.batchStateHash) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'WORKBOOK_STALE',
        'The batch has changed since this workbook was exported. Export a fresh workbook and re-apply your changes.',
      );
    }

    const { meta: definitions } = await loadAllowanceDefinitions(this.prisma);
    const analysis = analyseReviewWorkbook({
      workbook,
      payslips: batch.payslips,
      definitions,
    });

    const visibleRows = analysis.rows
      .filter((r) => r.status !== 'IGNORED')
      .slice(0, MAX_PREVIEW_ROWS);

    if (analysis.errors.length > 0) {
      return {
        previewId: null,
        applicable: false,
        expiresAt: null,
        batchStateHash,
        summary: analysis.summary,
        rows: visibleRows,
        errors: analysis.errors,
      };
    }

    if (analysis.edits.length === 0 && analysis.decisions.length === 0) {
      throw new BadRequestException(
        'No changes or decisions were found in the uploaded workbook.',
      );
    }

    const payload: PreviewPayload = {
      version: 2,
      edits: analysis.edits,
      decisions: analysis.decisions,
    };
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS);
    const preview = await this.prisma.reviewWorkbookPreview.create({
      data: {
        payslipBatchId: batchId,
        reviewWorkbookId: exportRow.id,
        fileHash: createHash('sha256').update(buffer).digest('hex'),
        batchStateHash,
        payload: payload as unknown as Prisma.InputJsonValue,
        expiresAt,
        createdById: actor.actorHrOfficerId,
      },
    });

    await this.audit.log({
      actorType: actor.actorType,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: 'PAYSLIP_WORKBOOK_PREVIEW_CREATED',
      entityType: 'PayslipBatch',
      entityId: batchId,
      metadata: payslipAuditMetadata({
        companyId: batch.accountingCompanyId,
        periodId: batch.payrollPeriodId,
        batchId,
        previewId: preview.id,
        counts: {
          edited: analysis.edits.length,
          decisions: analysis.decisions.length,
          reviewed: analysis.decisions.filter((d) => d.decision === 'REVIEWED')
            .length,
          held: analysis.decisions.filter((d) => d.decision === 'HOLD').length,
          rejected: analysis.decisions.filter((d) => d.decision === 'REJECT')
            .length,
          reset: analysis.decisions.filter((d) => d.decision === 'RESET')
            .length,
        },
      }),
    });

    return {
      previewId: preview.id,
      applicable: true,
      expiresAt,
      batchStateHash,
      summary: analysis.summary,
      rows: visibleRows,
      errors: [],
    };
  }

  /**
   * Step 2: apply a stored preview in ONE transaction: claim the preview, re-check the batch under a row lock,
   * recalculate and persist every edited payslip (inputs, outputs and line items), then record the decisions.
   * Either everything is applied or nothing is. Applying the same preview again returns the first result.
   */
  async applyWorkbook(
    batchId: string,
    previewId: string,
    actor: ReviewActor,
  ): Promise<WorkbookApplyResult> {
    const preview = await this.prisma.reviewWorkbookPreview.findUnique({
      where: { id: previewId },
    });
    if (!preview)
      throw new NotFoundException(`Preview ${previewId} not found.`);
    if (preview.payslipBatchId !== batchId) {
      throw new BadRequestException('Preview does not belong to this batch.');
    }
    if (preview.createdById !== actor.actorHrOfficerId) {
      throw new ForbiddenException(
        'This preview was created by another HR officer.',
      );
    }
    if (preview.appliedAt) return this.storedResult(preview);
    if (new Date() > preview.expiresAt) throw this.expired(preview.expiresAt);

    const plan = preview.payload as unknown as Partial<PreviewPayload> | null;
    if (
      !plan ||
      plan.version !== 2 ||
      !Array.isArray(plan.edits) ||
      !Array.isArray(plan.decisions)
    ) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'WORKBOOK_STALE',
        'This preview was created by an older version of the system. Re-upload the workbook.',
      );
    }
    const edits = plan.edits;
    const decisions = plan.decisions;

    let result: WorkbookApplyResult;
    const scope = { companyId: '', periodId: '' };
    try {
      result = await runPayslipTransaction(this.prisma, 'BULK', async (tx) => {
        // Serialise every apply (and any other writer that takes this lock) on the batch.
        await tx.$queryRaw`SELECT id FROM "PayslipBatch" WHERE id = ${batchId} FOR UPDATE`;

        // Claim the preview exactly once. Rolls back with everything else if a later step fails.
        const claimed = await tx.reviewWorkbookPreview.updateMany({
          where: {
            id: previewId,
            appliedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { appliedAt: new Date() },
        });
        if (claimed.count !== 1) {
          const fresh = await tx.reviewWorkbookPreview.findUnique({
            where: { id: previewId },
            select: { appliedAt: true, expiresAt: true },
          });
          if (fresh?.appliedAt) throw new PreviewAlreadyApplied();
          throw this.expired(fresh?.expiresAt ?? preview.expiresAt);
        }

        const batch = await tx.payslipBatch.findUnique({
          where: { id: batchId },
          include: { payslips: { select: PAYSLIP_STATE_SELECT } },
        });
        if (!batch) throw new NotFoundException(`Batch ${batchId} not found.`);
        await this.assertLatestAndReviewable(tx, batch);
        scope.companyId = batch.accountingCompanyId;
        scope.periodId = batch.payrollPeriodId;

        if (computeBatchStateHash(batch.payslips) !== preview.batchStateHash) {
          throw payslipError(
            HttpStatus.CONFLICT,
            'WORKBOOK_STALE',
            'The batch has changed since the preview was created. Re-upload the workbook.',
          );
        }

        const { meta: definitions, idByCanonicalName } =
          await loadAllowanceDefinitions(tx);
        const payslipById = new Map(batch.payslips.map((p) => [p.id, p]));

        for (const edit of edits) {
          const payslip = payslipById.get(edit.payslipId);
          if (!payslip)
            throw new BadRequestException(
              `Payslip ${edit.payslipId} is not part of this batch.`,
            );
          if (payslip.status === PayslipStatus.APPROVED) {
            throw payslipError(
              HttpStatus.CONFLICT,
              'PAYSLIP_APPROVED_IMMUTABLE',
              `Staff ID ${payslip.staffId} is already approved and cannot be edited here.`,
            );
          }

          // Recalculate from the CURRENT stored inputs plus the validated edit.
          const nextInputs = applyEditToInputs(
            payslip.calculationInputs as unknown as CalculationInputs,
            edit,
          );
          const { lines, ...outputs } = calculatePayslip(
            nextInputs,
            definitions,
          );
          const wasReviewed =
            payslip.status === PayslipStatus.IN_REVIEW ||
            payslip.status === PayslipStatus.HELD ||
            payslip.reviewedAt !== null;

          await tx.payslip.update({
            where: { id: payslip.id },
            data: {
              calculationInputs: nextInputs as unknown as Prisma.InputJsonValue,
              calculationOutputs: outputs,
              // An edited payslip must be re-reviewed: same rule as a single-payslip correction.
              status: PayslipStatus.CALCULATED,
              changedSinceReview: wasReviewed,
              approvedAt: null,
              reviewedAt: null,
              reviewedById: null,
            },
          });
          await replacePayslipLines(tx, payslip.id, lines, idByCanonicalName);
        }

        if (decisions.length > 0) {
          await this.reviewDecisionService.recordReviewDecisions(
            batchId,
            {
              expectedVersion: batch.version,
              decisions: decisions.map((d) => ({
                payslipId: d.payslipId,
                decision: d.decision,
                note: d.note,
              })),
            },
            { id: actor.actorHrOfficerId },
            { tx },
          );
        }

        const countsRaw = await tx.payslip.groupBy({
          by: ['status'],
          where: { payslipBatchId: batchId },
          _count: true,
        });
        const statusCounts = {
          CALCULATED: 0,
          IN_REVIEW: 0,
          HELD: 0,
          REJECTED: 0,
          APPROVED: 0,
        };
        for (const row of countsRaw) {
          if (row.status in statusCounts) statusCounts[row.status] = row._count;
        }
        const finalBatch = await tx.payslipBatch.findUniqueOrThrow({
          where: { id: batchId },
          select: { status: true },
        });

        const applied: WorkbookApplyResult = {
          applied: true,
          previewId,
          batchId,
          batchStatus: finalBatch.status,
          correctionBatchId: null,
          correctionVersion: null,
          counts: {
            recalculated: edits.length,
            decisions: decisions.length,
            correctionPayslips: 0,
          },
          statusCounts,
        };

        await tx.reviewWorkbookPreview.update({
          where: { id: previewId },
          data: { result: applied as unknown as Prisma.InputJsonValue },
        });
        await tx.reviewWorkbook.update({
          where: { id: preview.reviewWorkbookId },
          data: {
            reuploadedAt: new Date(),
            diff: {
              previewId,
              edited: edits.map((e) => e.staffId),
              decided: decisions.length,
            },
          },
        });
        return applied;
      });
    } catch (err) {
      if (err instanceof PreviewAlreadyApplied) {
        const stored =
          await this.prisma.reviewWorkbookPreview.findUniqueOrThrow({
            where: { id: previewId },
          });
        return this.storedResult(stored);
      }
      throw err;
    }

    await this.audit.log({
      actorType: actor.actorType,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: 'PAYSLIP_REVIEW_WORKBOOK_APPLIED',
      entityType: 'PayslipBatch',
      entityId: batchId,
      metadata: payslipAuditMetadata({
        companyId: scope.companyId,
        periodId: scope.periodId,
        batchId,
        previewId,
        counts: result.counts,
        payslipIds: [
          ...new Set([
            ...edits.map((e) => e.payslipId),
            ...decisions.map((d) => d.payslipId),
          ]),
        ],
      }),
    });

    return result;
  }

  private storedResult(preview: {
    id: string;
    payslipBatchId: string;
    result: Prisma.JsonValue | null;
  }): WorkbookApplyResult {
    if (
      preview.result &&
      typeof preview.result === 'object' &&
      !Array.isArray(preview.result)
    ) {
      return preview.result as unknown as WorkbookApplyResult;
    }
    throw new ConflictException('This preview was already applied.');
  }

  private expired(expiredAt: Date) {
    return payslipError(
      HttpStatus.GONE,
      'PREVIEW_EXPIRED',
      'The workbook preview has expired. Please re-upload the workbook.',
      { expiredAt },
    );
  }

  /** The batch must be the newest version of its company and period, and still open for review. */
  private async assertLatestAndReviewable(
    db: Pick<Prisma.TransactionClient, 'payslipBatch'>,
    batch: {
      id: string;
      version: number;
      status: PayslipBatchStatus;
      accountingCompanyId: string;
      payrollPeriodId: string;
    },
  ): Promise<void> {
    const latest = await db.payslipBatch.findFirst({
      where: {
        accountingCompanyId: batch.accountingCompanyId,
        payrollPeriodId: batch.payrollPeriodId,
      },
      orderBy: { version: 'desc' },
      select: { id: true, version: true },
    });
    if (latest && latest.id !== batch.id) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'NEWER_VERSION_EXISTS',
        'A newer version of this payroll exists. Workbook changes must target the latest version.',
        { latestVersion: latest.version },
      );
    }
    if (!REVIEWABLE.includes(batch.status)) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'BATCH_NOT_REVIEWABLE',
        `Batch status ${batch.status} is not open for review.`,
      );
    }
  }
}
