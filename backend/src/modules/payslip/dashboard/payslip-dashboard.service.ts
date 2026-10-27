import {
  HttpStatus,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { calculatePayslip } from '../calculation/calculation-engine';
import { loadAllowanceDefinitions } from '../calculation/allowance-metadata';
import { replacePayslipLines } from '../calculation/payslip-lines';
import { mergeInputOverrides } from '../calculation/merge-inputs';
import {
  HrOfficerRole,
  PayslipStatus,
  Prisma,
} from '../../../generated/prisma/client';
import type { CalculationInputs } from '../calculation/calculation.types';
import { CorrectPayslipDto } from './correct-payslip.dto';
import { PayslipCorrectionService } from '../correction/payslip-correction.service';
import { runPayslipTransaction } from '../shared/payslip-transaction';
import { payslipError } from '../shared/payslip-error-codes';
import {
  PAYSLIP_AUDIT_ACTOR,
  payslipAuditMetadata,
} from '../shared/payslip-audit';

export interface PeriodRollup {
  accountingCompanyId: string;
  accountingCompanyName: string;
  totalPayslips: number;
  approvedPayslips: number;
  totalNetServiceFee: number;
}

@Injectable()
export class PayslipDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly correctionService: PayslipCorrectionService,
  ) {}

  async getPeriodRollup(
    payrollPeriodId?: string,
    actor?: { id: string; role: string },
  ): Promise<PeriodRollup[]> {
    const claims =
      actor && actor.role !== HrOfficerRole.ADMIN
        ? await this.prisma.payslipWorkloadClaim.findMany({
            where: { claimedById: actor.id },
            select: { accountingCompanyId: true, payrollPeriodId: true },
          })
        : [];
    const allowed = new Set(
      claims.map(
        (claim) => `${claim.accountingCompanyId}:${claim.payrollPeriodId}`,
      ),
    );
    const periods = await this.prisma.payrollPeriod.findMany({
      where: payrollPeriodId ? { id: payrollPeriodId } : undefined,
      include: {
        payslipBatches: {
          include: {
            accountingCompany: { select: { id: true, name: true } },
            payslips: {
              select: { id: true, status: true, calculationOutputs: true },
            },
          },
          orderBy: { version: 'desc' },
        },
      },
    });

    const rollups: Map<string, PeriodRollup> = new Map();

    for (const period of periods) {
      const latestBatches = new Map<
        string,
        (typeof period.payslipBatches)[0]
      >();
      for (const batch of period.payslipBatches) {
        if (!latestBatches.has(batch.accountingCompanyId)) {
          latestBatches.set(batch.accountingCompanyId, batch);
        }
      }

      for (const batch of latestBatches.values()) {
        if (
          actor &&
          actor.role !== HrOfficerRole.ADMIN &&
          !allowed.has(`${batch.accountingCompanyId}:${batch.payrollPeriodId}`)
        )
          continue;
        const compId = batch.accountingCompanyId;
        const compName = batch.accountingCompany.name;

        let total = 0;
        let approved = 0;
        let sumNsf = 0;

        for (const payslip of batch.payslips) {
          total++;
          if (payslip.status === PayslipStatus.APPROVED) {
            approved++;
          }
          const outputs =
            (payslip.calculationOutputs as Record<string, unknown>) || {};
          const nsf =
            typeof outputs['netServiceFee'] === 'number'
              ? outputs['netServiceFee']
              : 0;
          sumNsf += nsf;
        }

        const existing = rollups.get(compId);
        if (existing) {
          existing.totalPayslips += total;
          existing.approvedPayslips += approved;
          existing.totalNetServiceFee += sumNsf;
        } else {
          rollups.set(compId, {
            accountingCompanyId: compId,
            accountingCompanyName: compName,
            totalPayslips: total,
            approvedPayslips: approved,
            totalNetServiceFee: sumNsf,
          });
        }
      }
    }

    return Array.from(rollups.values());
  }

  async getPayslipsForBatch(
    batchId: string,
    options?: { limit?: number; cursor?: string; status?: PayslipStatus },
  ) {
    const limit = options?.limit ?? 50;
    const cursor = options?.cursor;
    const status = options?.status;

    const items = await this.prisma.payslip.findMany({
      where: {
        payslipBatchId: batchId,
        ...(status ? { status } : {}),
      },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            jobTitle: true,
            department: true,
          },
        },
        lines: { include: { allowanceDefinition: true } },
      },
      orderBy: { id: 'asc' },
    });

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const nextItem = items.pop();
      nextCursor = nextItem?.id ?? null;
    }

    return { items, nextCursor };
  }

  async correctSinglePayslip(
    payslipId: string,
    overrides: CorrectPayslipDto,
    actor: { actorType: string; actorHrOfficerId: string },
  ) {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      include: {
        lines: true,
        payslipBatch: { include: { payslips: { include: { lines: true } } } },
      },
    });

    if (!payslip) throw new NotFoundException('Payslip not found');

    if (payslip.status === PayslipStatus.APPROVED) {
      const correction = await this.correctionService.createCorrectionVersion(
        [{ payslipId, overrides }],
        actor,
      );
      return {
        batchId: correction.batchId,
        payslipId: correction.replacementPayslipIds[payslipId],
      };
    }

    if (payslip.status === PayslipStatus.REJECTED) {
      throw new ConflictException(
        'Rejected payslips must be reset to CALCULATED before editing.',
      );
    }

    // D-LATEST check for non-approved payslip
    const latestBatch = await this.prisma.payslipBatch.findFirst({
      where: {
        accountingCompanyId: payslip.payslipBatch.accountingCompanyId,
        payrollPeriodId: payslip.payslipBatch.payrollPeriodId,
      },
      orderBy: { version: 'desc' },
      select: { id: true, version: true },
    });

    if (latestBatch && latestBatch.id !== payslip.payslipBatchId) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'NEWER_VERSION_EXISTS',
        'A newer version of this payroll exists. Edits must target the latest version.',
        { latestVersion: latestBatch.version },
      );
    }

    const wasReviewed = Boolean(
      payslip.status === PayslipStatus.IN_REVIEW ||
      payslip.status === PayslipStatus.HELD ||
      payslip.reviewedAt !== null,
    );

    // Same inputs merge, allowance definitions and line layout as the initial calculation and the workbook apply.
    const newInputs = mergeInputOverrides(
      (payslip.calculationInputs as unknown as CalculationInputs) ||
        ({} as CalculationInputs),
      overrides,
    );

    const updatedPayslip = await runPayslipTransaction(
      this.prisma,
      'ROW',
      async (tx) => {
        const { meta, idByCanonicalName } = await loadAllowanceDefinitions(tx);
        const { lines, ...outputs } = calculatePayslip(newInputs, meta);

        // Optimistic guard: the row must be exactly as it was read (not edited, reviewed or approved meanwhile).
        const claimed = await tx.payslip.updateMany({
          where: {
            id: payslipId,
            updatedAt: payslip.updatedAt,
            status: { not: PayslipStatus.APPROVED },
          },
          data: {
            calculationInputs: newInputs as unknown as Prisma.InputJsonValue,
            calculationOutputs: outputs,
            status: PayslipStatus.CALCULATED,
            changedSinceReview: wasReviewed,
            approvedAt: null,
            reviewedAt: null,
            reviewedById: null,
          },
        });
        if (claimed.count !== 1) {
          throw payslipError(
            HttpStatus.CONFLICT,
            'PAYSLIP_CHANGED_CONCURRENTLY',
            'The payslip changed while you were editing it. Reload it and try again.',
          );
        }

        await replacePayslipLines(tx, payslipId, lines, idByCanonicalName);
        return tx.payslip.findUniqueOrThrow({ where: { id: payslipId } });
      },
    );

    await this.audit.log({
      actorType: PAYSLIP_AUDIT_ACTOR,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: 'PAYSLIP_CORRECTED',
      entityType: 'PAYSLIP',
      entityId: payslipId,
      metadata: payslipAuditMetadata({
        companyId: payslip.payslipBatch.accountingCompanyId,
        periodId: payslip.payslipBatch.payrollPeriodId,
        batchId: payslip.payslipBatchId,
        payslipId,
      }),
    });

    return updatedPayslip;
  }
}
