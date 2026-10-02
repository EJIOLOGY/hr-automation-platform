import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  calculatePayslip,
  type AllowanceMetadata,
} from '../calculation/calculation-engine';
import { HrOfficerRole, PayslipStatus, Prisma } from '../../../generated/prisma/client';
import type { CalculationInputs } from '../calculation/calculation.types';
import { CorrectPayslipDto } from './correct-payslip.dto';

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
  ) {}

  async getPeriodRollup(payrollPeriodId?: string, actor?: { id: string; role: string }): Promise<PeriodRollup[]> {
    const claims = actor?.role === HrOfficerRole.ADMIN ? [] : await this.prisma.payslipWorkloadClaim.findMany({ where: { claimedById: actor?.id }, select: { accountingCompanyId: true, payrollPeriodId: true } });
    const allowed = new Set(claims.map((claim) => `${claim.accountingCompanyId}:${claim.payrollPeriodId}`));
    const periods = await this.prisma.payrollPeriod.findMany({
      where: payrollPeriodId ? { id: payrollPeriodId } : undefined,
      include: {
        payslipBatches: {
          include: {
            accountingCompany: { select: { id: true, name: true } },
            payslips: { select: { id: true, status: true, calculationOutputs: true } },
          },
          orderBy: { version: 'desc' },
        },
      },
    });

    const rollups: Map<string, PeriodRollup> = new Map();

    for (const period of periods) {
      const latestBatches = new Map<string, typeof period.payslipBatches[0]>();
      for (const batch of period.payslipBatches) {
        if (!latestBatches.has(batch.accountingCompanyId)) {
          latestBatches.set(batch.accountingCompanyId, batch);
        }
      }

      for (const batch of latestBatches.values()) {
        if (actor?.role !== HrOfficerRole.ADMIN && !allowed.has(`${batch.accountingCompanyId}:${batch.payrollPeriodId}`)) continue;
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
          const outputs = (payslip.calculationOutputs as Record<string, unknown>) || {};
          const nsf = typeof outputs['netServiceFee'] === 'number' ? outputs['netServiceFee'] : 0;
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
        employee: { select: { id: true, fullName: true, jobTitle: true, department: true } },
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
      include: { lines: true, payslipBatch: { include: { payslips: { include: { lines: true } } } } },
    });

    if (!payslip) throw new NotFoundException('Payslip not found');

    const existingInputs = (payslip.calculationInputs as unknown as CalculationInputs) || {};
    const newInputs: CalculationInputs = {
      ...existingInputs,
      ...overrides,
    };

    const allowanceDefs = await this.prisma.allowanceDefinition.findMany();
    const allowanceMeta: Record<string, AllowanceMetadata> = {};
    for (const def of allowanceDefs) {
      allowanceMeta[def.canonicalName] = {
        canonicalName: def.canonicalName,
        displayLabel: def.sourceHeader,
        classification: def.classification,
        affectsGrossEarnings: def.affectsGrossEarnings,
        affectsNetServiceFee: def.affectsNetServiceFee,
        supportsArrears: def.supportsArrears,
        sortOrder: def.sortOrder,
      };
    }

    const result = calculatePayslip(newInputs, allowanceMeta);
    const { lines, ...outputs } = result;

    if (payslip.status === PayslipStatus.APPROVED) {
      const correction = await this.prisma.$transaction(async (tx) => {
        const latest = await tx.payslipBatch.findFirst({
          where: { accountingCompanyId: payslip.payslipBatch.accountingCompanyId, payrollPeriodId: payslip.payslipBatch.payrollPeriodId },
          orderBy: { version: 'desc' }, select: { version: true },
        });
        const batch = await tx.payslipBatch.create({ data: {
          accountingCompanyId: payslip.payslipBatch.accountingCompanyId,
          payrollPeriodId: payslip.payslipBatch.payrollPeriodId,
          billingRateUploadId: payslip.payslipBatch.billingRateUploadId,
          version: (latest?.version ?? 0) + 1,
          status: 'IN_REVIEW', createdById: actor.actorHrOfficerId, calculatedAt: new Date(),
        } });
        let replacementId = '';
        for (const original of payslip.payslipBatch.payslips) {
          const isCorrected = original.id === payslip.id;
          const created = await tx.payslip.create({ data: {
            payslipBatchId: batch.id, billingRateRowId: original.billingRateRowId,
            employeeId: original.employeeId, staffId: original.staffId,
            status: PayslipStatus.IN_REVIEW, supersedesPayslipId: original.id,
            calculationInputs: (isCorrected ? newInputs : original.calculationInputs) as Prisma.InputJsonValue,
            calculationOutputs: (isCorrected ? outputs : original.calculationOutputs) as Prisma.InputJsonValue,
            reviewData: { correctionOf: original.id, correctedBy: actor.actorHrOfficerId } as Prisma.InputJsonValue,
          } });
          const sourceLines = isCorrected ? lines : original.lines;
          for (const line of sourceLines) await tx.payslipLine.create({ data: {
            payslipId: created.id, name: line.name, kind: line.kind, amount: new Prisma.Decimal(line.amount),
            taxClass: line.taxClass, sortOrder: line.sortOrder, sourceCell: line.sourceCell,
            allowanceDefinitionId: isCorrected ? null : (line as typeof original.lines[number]).allowanceDefinitionId,
          } });
          if (isCorrected) replacementId = created.id;
        }
        return { batchId: batch.id, payslipId: replacementId };
      });
      await this.audit.log({ actorType: actor.actorType, actorHrOfficerId: actor.actorHrOfficerId,
        action: 'PAYSLIP_CORRECTION_VERSION_CREATED', entityType: 'PAYSLIP', entityId: payslipId,
        metadata: { replacementPayslipId: correction.payslipId, replacementBatchId: correction.batchId, overrides }, });
      return correction;
    }

    if (payslip.status === PayslipStatus.REJECTED) {
      throw new ConflictException('Rejected payslips must be recalculated from a reviewed workbook.');
    }

    const updatedPayslip = await this.prisma.$transaction(async (tx) => {
      await tx.payslipLine.deleteMany({ where: { payslipId } });

      const updated = await tx.payslip.update({
        where: { id: payslipId },
        data: {
          calculationInputs: newInputs as unknown as Prisma.InputJsonValue,
          calculationOutputs: outputs as unknown as Prisma.InputJsonValue,
          status: PayslipStatus.CALCULATED,
          approvedAt: null,
          reviewedAt: null,
        },
      });

      for (const line of lines) {
        const def = allowanceDefs.find(d => d.canonicalName === line.canonicalName);
        await tx.payslipLine.create({
          data: {
            payslipId: updated.id,
            allowanceDefinitionId: def?.id ?? '',
            name: line.name,
            kind: line.kind,
            amount: new Prisma.Decimal(line.amount),
            taxClass: line.taxClass,
          },
        });
      }

      return updated;
    });

    await this.audit.log({
      actorType: actor.actorType,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: 'PAYSLIP_CORRECTED',
      entityType: 'PAYSLIP',
      entityId: payslipId,
      metadata: { overrides },
    });

    return updatedPayslip;
  }
}
