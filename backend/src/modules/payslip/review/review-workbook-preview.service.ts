import { BadRequestException, ConflictException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { Prisma } from '../../../generated/prisma/client';
import { payslipError } from '../shared/payslip-error-codes';
import { PAYSLIP_AUDIT_ACTOR, payslipAuditMetadata } from '../shared/payslip-audit';
import { ReviewDecisionService } from './review-decision.service';
import { computeBatchStateHash, ReviewActor } from './review-workbook.service';

function cellToString(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val).trim();
  if (typeof val === 'object' && 'text' in (val as object)) return String((val as { text: unknown }).text ?? '').trim();
  return '';
}

export interface WorkbookDecision {
  payslipId: string;
  staffId: string;
  decision: 'REVIEWED' | 'HOLD' | 'REJECT' | 'RESET';
  note?: string;
}

export interface WorkbookPreviewResult {
  previewId: string;
  expiresAt: Date;
  batchStateHash: string;
  decisions: WorkbookDecision[];
  counts: {
    reviewed: number;
    held: number;
    rejected: number;
    reset: number;
    skipped: number;
  };
}

export interface WorkbookApplyResult {
  previewId: string;
  batchId: string;
  batchStatus: string;
  counts: { updated: number; unchanged: number };
  statusCounts: {
    CALCULATED: number;
    IN_REVIEW: number;
    HELD: number;
    REJECTED: number;
    APPROVED: number;
  };
}

const PREVIEW_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Maps the HRDecision cell value from the exported workbook to the
 * internal decision vocabulary used by ReviewDecisionService.
 */
function mapDecisionCell(raw: string): WorkbookDecision['decision'] | null {
  switch (raw.toUpperCase()) {
    case 'APPROVE': return 'REVIEWED';
    case 'HOLD':    return 'HOLD';
    case 'REJECT':  return 'REJECT';
    case 'RESET':   return 'RESET';
    default:        return null;
  }
}

@Injectable()
export class ReviewWorkbookPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reviewDecisionService: ReviewDecisionService,
  ) {}

  /**
   * Step 1 of the preview/apply pattern.
   *
   * Parses the uploaded workbook, validates the decisions, creates a
   * short-lived `ReviewWorkbookPreview` record (10 min TTL), and returns
   * the diff so the caller can confirm before applying.
   */
  async previewWorkbook(
    batchId: string,
    buffer: Buffer,
    actor: ReviewActor,
  ): Promise<WorkbookPreviewResult> {
    const batch = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
      include: {
        payslips: {
          select: { id: true, staffId: true, contentHash: true, status: true },
        },
      },
    });
    if (!batch) throw new NotFoundException(`Batch ${batchId} not found.`);

    const fileHash = createHash('sha256').update(buffer).digest('hex');
    const batchStateHash = computeBatchStateHash(
      batch.payslips.map((p) => ({ staffId: p.staffId, contentHash: p.contentHash, status: p.status })),
    );

    // Build a lookup: staffId → payslipId
    const payslipByStaff = new Map(batch.payslips.map((p) => [p.staffId, p]));
    // Also support lookup by payslipId (col 1 in new export layout)
    const payslipById = new Map(batch.payslips.map((p) => [p.id, p]));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as Buffer & ArrayBuffer);

    const ws = wb.getWorksheet('Payslips');
    if (!ws) throw new BadRequestException('Uploaded file is missing the "Payslips" sheet.');

    const decisions: WorkbookDecision[] = [];
    const errors: Array<{ row: number; message: string }> = [];

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header

      const col1 = cellToString(row.getCell(1).value);
      const col2 = cellToString(row.getCell(2).value);

      // Support both old (staffId in col 1) and new (payslipId in col 1) layouts
      let payslip = payslipById.get(col1) ?? payslipByStaff.get(col1);
      if (!payslip && col2) payslip = payslipByStaff.get(col2);

      if (!payslip) {
        // Skip rows without a recognisable payslip — could be blank trailing rows
        return;
      }

      // In old layout: col 14 = ReviewNotes, col 15 = HRDecision
      // In new layout: col 16 = ReviewNotes, col 17 = HRDecision
      // Detect layout by whether col1 is a UUID (new) or staff ID (old)
      const isNewLayout = payslipById.has(col1);
      const noteColIdx  = isNewLayout ? 16 : 14;
      const decisionColIdx = isNewLayout ? 17 : 15;

      const rawDecision = cellToString(row.getCell(decisionColIdx).value);
      const note = cellToString(row.getCell(noteColIdx).value) || undefined;

      if (!rawDecision) return; // blank decision = skip

      const decision = mapDecisionCell(rawDecision);
      if (!decision) {
        errors.push({ row: rowNumber, message: `Unknown decision value "${rawDecision}" in row ${rowNumber}.` });
        return;
      }

      if ((decision === 'HOLD' || decision === 'REJECT') && (!note || note.length < 3)) {
        errors.push({
          row: rowNumber,
          message: `${decision} decision in row ${rowNumber} requires a note of at least 3 characters.`,
        });
        return;
      }

      decisions.push({ payslipId: payslip.id, staffId: payslip.staffId, decision, note });
    });

    if (errors.length > 0) {
      throw payslipError(
        HttpStatus.BAD_REQUEST,
        'WORKBOOK_PARSE_ERRORS',
        'One or more rows in the uploaded workbook failed validation.',
        { errors },
      );
    }

    if (decisions.length === 0) {
      throw new BadRequestException('No actionable decisions found in the uploaded workbook.');
    }

    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS);

    // A preview must be associated with the most recently exported ReviewWorkbook
    const latestWorkbook = await this.prisma.reviewWorkbook.findFirst({
      where: { payslipBatchId: batchId },
      orderBy: { exportedAt: 'desc' },
      select: { id: true },
    });

    if (!latestWorkbook) {
      throw new BadRequestException(
        'No review workbook has been exported for this batch. Export the workbook first.',
      );
    }

    const preview = await this.prisma.reviewWorkbookPreview.create({
      data: {
        payslipBatchId: batchId,
        reviewWorkbookId: latestWorkbook.id,
        fileHash,
        batchStateHash,
        payload: decisions as unknown as Prisma.InputJsonValue,
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
          reviewed: decisions.filter((d) => d.decision === 'REVIEWED').length,
          held:     decisions.filter((d) => d.decision === 'HOLD').length,
          rejected: decisions.filter((d) => d.decision === 'REJECT').length,
          reset:    decisions.filter((d) => d.decision === 'RESET').length,
        },
      }),
    });

    return {
      previewId: preview.id,
      expiresAt,
      batchStateHash,
      decisions,
      counts: {
        reviewed: decisions.filter((d) => d.decision === 'REVIEWED').length,
        held:     decisions.filter((d) => d.decision === 'HOLD').length,
        rejected: decisions.filter((d) => d.decision === 'REJECT').length,
        reset:    decisions.filter((d) => d.decision === 'RESET').length,
        skipped:  0,
      },
    };
  }

  /**
   * Step 2 of the preview/apply pattern.
   *
   * Validates the preview hasn't expired and the batch state hasn't changed
   * since the preview was created, then delegates to ReviewDecisionService.
   */
  async applyWorkbook(
    batchId: string,
    previewId: string,
    actor: ReviewActor,
  ): Promise<WorkbookApplyResult> {
    const preview = await this.prisma.reviewWorkbookPreview.findUnique({
      where: { id: previewId },
    });

    if (!preview) {
      throw new NotFoundException(`Preview ${previewId} not found.`);
    }

    if (preview.payslipBatchId !== batchId) {
      throw new BadRequestException('Preview does not belong to this batch.');
    }

    if (new Date() > preview.expiresAt) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'PREVIEW_EXPIRED',
        'The workbook preview has expired. Please re-upload the workbook.',
        { expiredAt: preview.expiresAt },
      );
    }

    // Compute current batch state hash and compare
    const batch = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
      include: {
        payslips: { select: { id: true, staffId: true, contentHash: true, status: true } },
      },
    });
    if (!batch) throw new NotFoundException(`Batch ${batchId} not found.`);

    const currentStateHash = computeBatchStateHash(
      batch.payslips.map((p) => ({ staffId: p.staffId, contentHash: p.contentHash, status: p.status })),
    );

    if (currentStateHash !== preview.batchStateHash) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'BATCH_CHANGED_SINCE_PREVIEW',
        'The batch has changed since the preview was created. Please re-upload the workbook.',
        { previewBatchStateHash: preview.batchStateHash, currentBatchStateHash: currentStateHash },
      );
    }

    const decisions = preview.payload as unknown as WorkbookDecision[];

    // Delegate to ReviewDecisionService using the minimal DTO structure it expects
    const reviewDto = {
      expectedVersion: batch.version,
      decisions: decisions.map((d) => ({
        payslipId: d.payslipId,
        decision: d.decision,
        note: d.note,
      })),
    };

    const reviewResult = await this.reviewDecisionService.recordReviewDecisions(batchId, reviewDto as any, {
      id: actor.actorHrOfficerId,
    });

    // Mark preview as consumed (update appliedAt)
    await this.prisma.reviewWorkbookPreview.update({
      where: { id: previewId },
      data: { appliedAt: new Date() },
    });

    await this.audit.log({
      actorType: actor.actorType,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: 'PAYSLIP_WORKBOOK_PREVIEW_APPLIED',
      entityType: 'PayslipBatch',
      entityId: batchId,
      metadata: payslipAuditMetadata({
        companyId: batch.accountingCompanyId,
        periodId: batch.payrollPeriodId,
        batchId,
        previewId,
        counts: reviewResult.counts,
      }),
    });

    return {
      previewId,
      batchId,
      batchStatus: reviewResult.batchStatus,
      counts: reviewResult.counts,
      statusCounts: reviewResult.statusCounts,
    };
  }
}
