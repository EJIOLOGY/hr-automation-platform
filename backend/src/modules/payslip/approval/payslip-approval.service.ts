import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipBatchStatus, PayslipStatus, Prisma } from '../../../generated/prisma/client';
import { computePayslipContentHash } from '../shared/content-hash';
import { payslipError } from '../shared/payslip-error-codes';
import { PAYSLIP_AUDIT_ACTOR, payslipAuditMetadata } from '../shared/payslip-audit';
import { runPayslipTransaction } from '../shared/payslip-transaction';
import {
  PAYSLIP_POST_APPROVAL_HOOKS,
  type PayslipPostApprovalHook,
} from '../shared/post-approval-hook';
import { ApproveBatchDto } from './dto/approve-batch.dto';
import { RejectBatchDto } from './dto/reject-batch.dto';

export interface ApprovalActor {
  actorType: string;
  actorHrOfficerId: string;
}

export interface ApproveBatchResult {
  batchId: string;
  status: PayslipBatchStatus;
  approvedCount: number;
  unresolved: {
    CALCULATED: number;
    HELD: number;
    REJECTED: number;
  };
  approvalId: string;
}

@Injectable()
export class PayslipApprovalService {
  private readonly logger = new Logger(PayslipApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional()
    @Inject(PAYSLIP_POST_APPROVAL_HOOKS)
    private readonly postApprovalHooks?: PayslipPostApprovalHook[],
  ) {}

  async approveBatch(
    batchId: string,
    dto: ApproveBatchDto,
    actor: ApprovalActor,
  ): Promise<ApproveBatchResult> {
    const batch = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const approvableStatuses: PayslipBatchStatus[] = [
      PayslipBatchStatus.CALCULATED,
      PayslipBatchStatus.IN_REVIEW,
      PayslipBatchStatus.PARTIALLY_APPROVED,
    ];
    if (!approvableStatuses.includes(batch.status)) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'BATCH_NOT_APPROVABLE',
        `Batch is not approvable (current: ${batch.status})`,
      );
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

    // Query status counts
    const countsRaw = await this.prisma.payslip.groupBy({
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
    for (const r of countsRaw) {
      if (r.status in statusCounts) {
        statusCounts[r.status as keyof typeof statusCounts] = r._count;
      }
    }

    if (statusCounts.IN_REVIEW === 0) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'NOTHING_TO_APPROVE',
        'No IN_REVIEW payslips found to approve.',
      );
    }

    const unresolved = statusCounts.CALCULATED + statusCounts.HELD + statusCounts.REJECTED;

    if (unresolved > 0) {
      if (dto.confirmUnresolvedCount === undefined) {
        // Query unresolved employee details (first 50, plus moreCount)
        const unresolvedList = await this.prisma.payslip.findMany({
          where: {
            payslipBatchId: batchId,
            status: { in: [PayslipStatus.CALCULATED, PayslipStatus.HELD, PayslipStatus.REJECTED] },
          },
          take: 51,
          select: {
            id: true,
            staffId: true,
            status: true,
            employee: { select: { fullName: true } },
          },
        });

        const employees = unresolvedList.slice(0, 50).map((p) => ({
          payslipId: p.id,
          staffId: p.staffId,
          employeeName: p.employee?.fullName ?? '',
          status: p.status,
        }));
        const moreCount = unresolvedList.length > 50 ? unresolved - 50 : 0;

        throw payslipError(
          HttpStatus.CONFLICT,
          'UNRESOLVED_PAYSLIPS',
          `Batch has ${unresolved} unresolved payslips. Confirmation required.`,
          {
            counts: {
              CALCULATED: statusCounts.CALCULATED,
              HELD: statusCounts.HELD,
              REJECTED: statusCounts.REJECTED,
            },
            total: unresolved,
            employees,
            moreCount,
          },
        );
      }

      if (dto.confirmUnresolvedCount !== unresolved) {
        throw payslipError(
          HttpStatus.CONFLICT,
          'UNRESOLVED_COUNT_CHANGED',
          `Unresolved payslip count has changed (expected ${dto.confirmUnresolvedCount}, current ${unresolved}).`,
          {
            currentUnresolved: unresolved,
            providedConfirmCount: dto.confirmUnresolvedCount,
          },
        );
      }
    }

    // Fetch all IN_REVIEW payslips with lines to compute contentHash
    const inReviewPayslips = await this.prisma.payslip.findMany({
      where: {
        payslipBatchId: batchId,
        status: PayslipStatus.IN_REVIEW,
      },
      select: {
        id: true,
        staffId: true,
        calculationInputs: true,
        calculationOutputs: true,
        lines: {
          select: {
            name: true,
            kind: true,
            amount: true,
            taxClass: true,
            sortOrder: true,
          },
        },
      },
    });

    const hashUpdates = inReviewPayslips.map((p) => ({
      id: p.id,
      hash: computePayslipContentHash({
        staffId: p.staffId,
        calculationInputs: p.calculationInputs as any,
        calculationOutputs: p.calculationOutputs as any,
        lines: p.lines.map((l) => ({
          name: l.name,
          kind: l.kind,
          amount: Number(l.amount),
          taxClass: l.taxClass,
          sortOrder: l.sortOrder,
        })),
      }),
    }));

    const now = new Date();
    const approvedCount = inReviewPayslips.length;
    const finalBatchStatus =
      unresolved === 0 ? PayslipBatchStatus.APPROVED : PayslipBatchStatus.PARTIALLY_APPROVED;

    // ONE BULK transaction using set-based statements
    const { approval } = await runPayslipTransaction(this.prisma, 'BULK', async (tx) => {
      // 1. Bulk update status, approvedAt, approvedById
      await tx.payslip.updateMany({
        where: {
          payslipBatchId: batchId,
          status: PayslipStatus.IN_REVIEW,
        },
        data: {
          status: PayslipStatus.APPROVED,
          approvedAt: now,
          approvedById: actor.actorHrOfficerId,
        },
      });

      // 2. Set contentHash in chunks
      const CHUNK_SIZE = 500;
      for (let i = 0; i < hashUpdates.length; i += CHUNK_SIZE) {
        const chunk = hashUpdates.slice(i, i + CHUNK_SIZE);
        const ids = chunk.map((c) => c.id);
        const hashes = chunk.map((c) => c.hash);

        if (typeof (tx as any).$executeRawUnsafe === 'function') {
          await (tx as any).$executeRawUnsafe(
            `UPDATE "Payslip" AS p
             SET "contentHash" = u.hash
             FROM unnest($1::text[], $2::text[]) AS u(id, hash)
             WHERE p.id = u.id`,
            ids,
            hashes,
          );
        } else {
          for (const item of chunk) {
            await tx.payslip.update({
              where: { id: item.id },
              data: { contentHash: item.hash },
            });
          }
        }
      }

      // 3. Insert PayslipBatchApproval record
      const approvalRecord = await tx.payslipBatchApproval.create({
        data: {
          payslipBatchId: batchId,
          approvedById: actor.actorHrOfficerId,
          batchVersion: batch.version,
          approvedCount,
          unresolvedCount: unresolved,
          partial: unresolved > 0,
          reason: dto.reason?.trim() || null,
        },
      });

      // 4. Update PayslipBatch
      await tx.payslipBatch.update({
        where: { id: batchId },
        data: {
          status: finalBatchStatus,
          approvedAt: now,
          approvedById: actor.actorHrOfficerId,
        },
      });

      return { approval: approvalRecord };
    });

    const approvedPayslipIds = inReviewPayslips.map((p) => p.id);

    // Call registered post-approval hooks (after transaction commits)
    const hooks = this.postApprovalHooks ? (Array.isArray(this.postApprovalHooks) ? this.postApprovalHooks : [this.postApprovalHooks]) : [];
    for (const hook of hooks) {
      try {
        await hook.onApproved({ batchId, payslipIds: approvedPayslipIds });
      } catch (hookErr: any) {
        this.logger.error(
          `Post-approval hook failed for batch ${batchId} [count=${approvedCount}]: ${hookErr?.message}`,
        );
      }
    }

    // Audit
    const auditAction =
      finalBatchStatus === PayslipBatchStatus.APPROVED
        ? 'PAYSLIP_BATCH_APPROVED'
        : 'PAYSLIP_BATCH_PARTIALLY_APPROVED';

    await this.audit.log({
      actorType: PAYSLIP_AUDIT_ACTOR,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: auditAction,
      entityType: 'PayslipBatch',
      entityId: batchId,
      metadata: payslipAuditMetadata({
        companyId: batch.accountingCompanyId,
        periodId: batch.payrollPeriodId,
        batchId,
        approvedCount,
        unresolvedCount: unresolved,
        version: batch.version,
        partial: unresolved > 0,
      }),
    });

    return {
      batchId,
      status: finalBatchStatus,
      approvedCount,
      unresolved: {
        CALCULATED: statusCounts.CALCULATED,
        HELD: statusCounts.HELD,
        REJECTED: statusCounts.REJECTED,
      },
      approvalId: approval.id,
    };
  }

  async rejectBatch(
    batchId: string,
    dto: RejectBatchDto,
    actor: ApprovalActor,
  ): Promise<{ batchId: string }> {
    const batch = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const rejectableStatuses: PayslipBatchStatus[] = [
      PayslipBatchStatus.CALCULATED,
      PayslipBatchStatus.IN_REVIEW,
      PayslipBatchStatus.PARTIALLY_APPROVED,
    ];
    if (!rejectableStatuses.includes(batch.status)) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'BATCH_NOT_APPROVABLE',
        `Batch is not rejectable (current: ${batch.status})`,
      );
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

    const now = new Date();

    await runPayslipTransaction(this.prisma, 'BULK', async (tx) => {
      await tx.payslipBatch.update({
        where: { id: batchId },
        data: {
          status: PayslipBatchStatus.REJECTED,
          rejectionReason: dto.reason,
          rejectedAt: now,
          rejectedById: actor.actorHrOfficerId,
          approvedAt: null,
        },
      });

      await tx.payslip.updateMany({
        where: {
          payslipBatchId: batchId,
          status: { not: PayslipStatus.APPROVED },
        },
        data: { status: PayslipStatus.REJECTED },
      });
    });

    await this.audit.log({
      actorType: PAYSLIP_AUDIT_ACTOR,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: 'PAYSLIP_BATCH_REJECTED',
      entityType: 'PayslipBatch',
      entityId: batchId,
      metadata: payslipAuditMetadata({
        companyId: batch.accountingCompanyId,
        periodId: batch.payrollPeriodId,
        batchId,
      }),
    });

    return { batchId };
  }

  async getPayslip(payslipId: string) {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      include: {
        lines: {
          orderBy: [
            { kind: 'asc' },
            { sortOrder: 'asc' },
          ],
        },
      },
    });

    if (!payslip) {
      throw new NotFoundException(`Payslip ${payslipId} not found`);
    }

    return payslip;
  }

  async listBatches(accountingCompanyId: string, payrollPeriodId?: string) {
    return this.prisma.payslipBatch.findMany({
      where: {
        accountingCompanyId,
        ...(payrollPeriodId ? { payrollPeriodId } : {}),
      },
      include: {
        accountingCompany: true,
        payrollPeriod: true,
        createdBy: {
          select: { fullName: true, email: true },
        },
        _count: {
          select: { payslips: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
