import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  calculatePayslip,
  type AllowanceMetadata,
} from '../calculation/calculation-engine';
import { PayslipStatus, Prisma } from '../../../generated/prisma/client';
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

  async getPeriodRollup(payrollPeriodId?: string): Promise<PeriodRollup[]> {
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
      include: { lines: true },
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
