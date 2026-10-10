import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PayslipBatchStatus, PayslipStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { payslipError } from '../shared/payslip-error-codes';
import { PAYSLIP_AUDIT_ACTOR, payslipAuditMetadata } from '../shared/payslip-audit';
import { runPayslipTransaction } from '../shared/payslip-transaction';
import { ReviewDecisionsDto } from './dto/review-decision.dto';

export interface ReviewDecisionResult {
  batchId: string;
  batchStatus: string;
  counts: {
    updated: number;
    unchanged: number;
  };
  statusCounts: {
    CALCULATED: number;
    IN_REVIEW: number;
    HELD: number;
    REJECTED: number;
    APPROVED: number;
  };
}

@Injectable()
export class ReviewDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async recordReviewDecisions(
    batchId: string,
    dto: ReviewDecisionsDto,
    actor: { id: string },
  ): Promise<ReviewDecisionResult> {
    const batch = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
      include: {
        payrollPeriod: true,
      },
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found.`);
    }

    // Latest version check (D-LATEST)
    const latestBatch = await this.prisma.payslipBatch.findFirst({
      where: {
        accountingCompanyId: batch.accountingCompanyId,
        payrollPeriodId: batch.payrollPeriodId,
      },
      orderBy: { version: 'desc' },
      select: { id: true, version: true },
    });

    if (latestBatch && latestBatch.id !== batch.id) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'NEWER_VERSION_EXISTS',
        'A newer version of this payroll exists.',
        { latestVersion: latestBatch.version },
      );
    }

    if (dto.expectedVersion !== batch.version) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'VERSION_MISMATCH',
        `Expected batch version ${dto.expectedVersion} but current version is ${batch.version}.`,
      );
    }

    const reviewableStatuses: PayslipBatchStatus[] = [
      PayslipBatchStatus.CALCULATED,
      PayslipBatchStatus.IN_REVIEW,
      PayslipBatchStatus.PARTIALLY_APPROVED,
    ];
    if (!reviewableStatuses.includes(batch.status)) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'BATCH_NOT_REVIEWABLE',
        `Batch status ${batch.status} is not reviewable.`,
      );
    }

    // Check unique payslip IDs
    const seenIds = new Set<string>();
    const duplicateIds = new Set<string>();
    for (const item of dto.decisions) {
      if (seenIds.has(item.payslipId)) {
        duplicateIds.add(item.payslipId);
      }
      seenIds.add(item.payslipId);
    }

    const errors: Array<{ payslipId: string; code: string; message: string }> = [];

    if (duplicateIds.size > 0) {
      for (const dupId of duplicateIds) {
        errors.push({
          payslipId: dupId,
          code: 'DUPLICATE_PAYSLIP_ID',
          message: 'Duplicate payslip ID in request payload.',
        });
      }
    }

    // Fetch all payslips belonging to this batch
    const payslipIds = Array.from(seenIds);
    const existingPayslips = await this.prisma.payslip.findMany({
      where: {
        id: { in: payslipIds },
        payslipBatchId: batchId,
      },
      select: {
        id: true,
        status: true,
        reviewNote: true,
      },
    });

    const payslipMap = new Map(existingPayslips.map((p) => [p.id, p]));

    for (const item of dto.decisions) {
      const payslip = payslipMap.get(item.payslipId);
      if (!payslip) {
        errors.push({
          payslipId: item.payslipId,
          code: 'PAYSLIP_NOT_FOUND',
          message: `Payslip ${item.payslipId} does not belong to batch ${batchId}.`,
        });
        continue;
      }

      // Check note requirement for HOLD and REJECT
      const note = item.note?.trim();
      if ((item.decision === 'HOLD' || item.decision === 'REJECT') && (!note || note.length < 3)) {
        errors.push({
          payslipId: item.payslipId,
          code: 'NOTE_REQUIRED',
          message: `${item.decision} decision requires a note of at least 3 characters.`,
        });
      }

      // Check transitions
      if (payslip.status === PayslipStatus.APPROVED) {
        errors.push({
          payslipId: item.payslipId,
          code: 'PAYSLIP_APPROVED_IMMUTABLE',
          message: 'Approved payslips cannot have review decisions applied.',
        });
      } else if (payslip.status === PayslipStatus.REJECTED && item.decision !== 'RESET') {
        errors.push({
          payslipId: item.payslipId,
          code: 'INVALID_TRANSITION',
          message: 'Rejected payslips can only be transitioned via RESET to CALCULATED.',
        });
      }
    }

    // ATOMIC: if any error, abort with 400 VALIDATION_FAILED
    if (errors.length > 0) {
      throw payslipError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'One or more review decisions failed validation.',
        { errors },
      );
    }

    // All valid - execute changes in one BULK transaction
    const now = new Date();
    let updatedCount = 0;
    let unchangedCount = 0;

    const toReviewed: string[] = [];
    const toHold: Array<{ id: string; note: string }> = [];
    const toReject: Array<{ id: string; note: string }> = [];
    const toReset: Array<{ id: string; note?: string }> = [];

    for (const item of dto.decisions) {
      const current = payslipMap.get(item.payslipId)!;
      const note = item.note?.trim() || null;

      if (item.decision === 'REVIEWED') {
        if (current.status === PayslipStatus.IN_REVIEW) {
          unchangedCount++;
        } else {
          updatedCount++;
          toReviewed.push(item.payslipId);
        }
      } else if (item.decision === 'HOLD') {
        updatedCount++;
        toHold.push({ id: item.payslipId, note: note! });
      } else if (item.decision === 'REJECT') {
        updatedCount++;
        toReject.push({ id: item.payslipId, note: note! });
      } else if (item.decision === 'RESET') {
        updatedCount++;
        toReset.push({ id: item.payslipId, note: note || undefined });
      }
    }

    const result = await runPayslipTransaction(this.prisma, 'BULK', async (tx) => {
      // 1. Apply REVIEWED updates
      if (toReviewed.length > 0) {
        await tx.payslip.updateMany({
          where: { id: { in: toReviewed } },
          data: {
            status: PayslipStatus.IN_REVIEW,
            reviewedAt: now,
            reviewedById: actor.id,
            changedSinceReview: false,
          },
        });
      }

      // 2. Apply HOLD updates
      for (const item of toHold) {
        await tx.payslip.update({
          where: { id: item.id },
          data: {
            status: PayslipStatus.HELD,
            reviewNote: item.note,
            reviewedAt: now,
            reviewedById: actor.id,
          },
        });
      }

      // 3. Apply REJECT updates
      for (const item of toReject) {
        await tx.payslip.update({
          where: { id: item.id },
          data: {
            status: PayslipStatus.REJECTED,
            reviewNote: item.note,
            reviewedAt: now,
            reviewedById: actor.id,
          },
        });
      }

      // 4. Apply RESET updates
      for (const item of toReset) {
        await tx.payslip.update({
          where: { id: item.id },
          data: {
            status: PayslipStatus.CALCULATED,
            reviewedAt: null,
            reviewedById: null,
            ...(item.note !== undefined ? { reviewNote: item.note } : {}),
          },
        });
      }

      // First successful decision moves a CALCULATED batch to IN_REVIEW
      let finalBatchStatus = batch.status;
      if (batch.status === PayslipBatchStatus.CALCULATED && updatedCount > 0) {
        await tx.payslipBatch.update({
          where: { id: batchId },
          data: { status: PayslipBatchStatus.IN_REVIEW },
        });
        finalBatchStatus = PayslipBatchStatus.IN_REVIEW;
      }

      // Query final status counts
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
        if (row.status in statusCounts) {
          statusCounts[row.status as keyof typeof statusCounts] = row._count;
        }
      }

      return {
        batchId,
        batchStatus: finalBatchStatus,
        counts: {
          updated: updatedCount,
          unchanged: unchangedCount,
        },
        statusCounts,
      };
    });

    // Audit PAYSLIP_REVIEW_DECISIONS_RECORDED (ids and counts only)
    await this.audit.log({
      actorType: PAYSLIP_AUDIT_ACTOR,
      actorHrOfficerId: actor.id,
      action: 'PAYSLIP_REVIEW_DECISIONS_RECORDED',
      entityType: 'PayslipBatch',
      entityId: batchId,
      metadata: payslipAuditMetadata({
        companyId: batch.accountingCompanyId,
        periodId: batch.payrollPeriodId,
        batchId,
        counts: {
          updated: updatedCount,
          unchanged: unchangedCount,
          reviewed: toReviewed.length,
          held: toHold.length,
          rejected: toReject.length,
          reset: toReset.length,
        },
        payslipIds: dto.decisions.map((d) => d.payslipId),
      }),
    });

    return result;
  }
}
