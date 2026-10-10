import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PayslipBatchStatus, PayslipStatus, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { calculatePayslip, type AllowanceMetadata } from '../calculation/calculation-engine';
import type { CalculationInputs } from '../calculation/calculation.types';
import { computePayslipContentHash } from '../shared/content-hash';
import { payslipError } from '../shared/payslip-error-codes';
import { PAYSLIP_AUDIT_ACTOR, payslipAuditMetadata } from '../shared/payslip-audit';
import { runPayslipTransaction } from '../shared/payslip-transaction';

export interface SingleCorrectionInput {
  payslipId: string;
  overrides: Record<string, any>;
}

export interface CorrectionVersionResult {
  batchId: string;
  version: number;
  replacementPayslipIds: Record<string, string>; // originalPayslipId -> newPayslipId
  carriedForwardCount: number;
  correctedCount: number;
}

@Injectable()
export class PayslipCorrectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createCorrectionVersion(
    corrections: SingleCorrectionInput[],
    actor: { actorType: string; actorHrOfficerId: string },
  ): Promise<CorrectionVersionResult> {
    if (!corrections || corrections.length === 0) {
      throw payslipError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'No corrections provided.');
    }

    const firstPayslip = await this.prisma.payslip.findUnique({
      where: { id: corrections[0].payslipId },
      include: {
        payslipBatch: {
          select: { accountingCompanyId: true, payrollPeriodId: true },
        },
      },
    });

    if (!firstPayslip) {
      throw new NotFoundException(`Payslip ${corrections[0].payslipId} not found.`);
    }

    const companyId = firstPayslip.payslipBatch.accountingCompanyId;
    const periodId = firstPayslip.payslipBatch.payrollPeriodId;

    // Resolve the LATEST batch of the run
    const latestBatch = await this.prisma.payslipBatch.findFirst({
      where: {
        accountingCompanyId: companyId,
        payrollPeriodId: periodId,
      },
      orderBy: { version: 'desc' },
      include: {
        payslips: {
          include: {
            lines: {
              include: { allowanceDefinition: true },
            },
          },
        },
      },
    });

    if (!latestBatch) {
      throw new NotFoundException('Latest batch not found for this company and period.');
    }

    // Require every corrected payslip to belong to the LATEST batch (D-LATEST)
    const latestBatchPayslipMap = new Map(latestBatch.payslips.map((p) => [p.id, p]));
    for (const corr of corrections) {
      if (!latestBatchPayslipMap.has(corr.payslipId)) {
        throw payslipError(
          HttpStatus.CONFLICT,
          'NEWER_VERSION_EXISTS',
          'A newer version of this payroll exists. Corrections must target the latest version.',
          { latestVersion: latestBatch.version },
        );
      }
    }

    // D-NOMIX: Refuse if latest batch is PARTIALLY_APPROVED and any corrected payslip is APPROVED,
    // or if source batch contains non-approved payslips.
    if (latestBatch.status === PayslipBatchStatus.PARTIALLY_APPROVED) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'FINISH_APPROVAL_FIRST',
        'Complete approval of the current partially approved batch before creating a correction version.',
      );
    }

    const nonApprovedInSource = latestBatch.payslips.filter(
      (p) => p.status !== PayslipStatus.APPROVED,
    );
    if (nonApprovedInSource.length > 0) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'FINISH_APPROVAL_FIRST',
        'All payslips in the batch must be APPROVED before creating a correction version.',
        { unapprovedCount: nonApprovedInSource.length },
      );
    }

    // Prepare allowance definitions
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

    const correctionsMap = new Map(corrections.map((c) => [c.payslipId, c.overrides]));
    const totalPayslips = latestBatch.payslips.length;
    const isAllCorrected = correctionsMap.size === totalPayslips;
    const nextStatus = isAllCorrected
      ? PayslipBatchStatus.IN_REVIEW
      : PayslipBatchStatus.PARTIALLY_APPROVED;

    // Pre-calculate corrected payslips and verify carried-forward integrity (D-CARRY)
    const preparedCorrected: Array<{
      original: typeof latestBatch.payslips[0];
      inputs: CalculationInputs;
      outputs: any;
      lines: any[];
    }> = [];

    const preparedCarriedForward: Array<{
      original: typeof latestBatch.payslips[0];
    }> = [];

    for (const original of latestBatch.payslips) {
      if (correctionsMap.has(original.id)) {
        const overrides = correctionsMap.get(original.id)!;
        const existingInputs = (original.calculationInputs as unknown as CalculationInputs) || {};
        const newInputs: CalculationInputs = {
          ...existingInputs,
          ...overrides,
        };
        const calcResult = calculatePayslip(newInputs, allowanceMeta);
        const { lines, ...outputs } = calcResult;
        preparedCorrected.push({
          original,
          inputs: newInputs,
          outputs,
          lines,
        });
      } else {
        // Verify carry-forward integrity
        const recomputedHash = computePayslipContentHash({
          staffId: original.staffId,
          calculationInputs: original.calculationInputs as any,
          calculationOutputs: original.calculationOutputs as any,
          lines: original.lines.map((l) => ({
            name: l.name,
            kind: l.kind,
            amount: Number(l.amount),
            taxClass: l.taxClass,
            sortOrder: l.sortOrder,
          })),
        });

        if (original.contentHash && recomputedHash !== original.contentHash) {
          throw payslipError(
            HttpStatus.INTERNAL_SERVER_ERROR,
            'CARRY_FORWARD_INTEGRITY',
            `Carry-forward integrity verification failed for staff ID ${original.staffId}.`,
            { staffId: original.staffId },
          );
        }

        preparedCarriedForward.push({ original });
      }
    }

    const now = new Date();
    const replacementPayslipIds: Record<string, string> = {};

    // ONE runPayslipTransaction(BULK)
    const newBatch = await runPayslipTransaction(this.prisma, 'BULK', async (tx) => {
      const createdBatch = await tx.payslipBatch.create({
        data: {
          accountingCompanyId: companyId,
          payrollPeriodId: periodId,
          billingRateUploadId: latestBatch.billingRateUploadId,
          version: latestBatch.version + 1,
          status: nextStatus,
          createdById: actor.actorHrOfficerId,
          calculatedAt: now,
        },
      });

      // Insert corrected payslips
      for (const item of preparedCorrected) {
        const createdPayslip = await tx.payslip.create({
          data: {
            payslipBatchId: createdBatch.id,
            billingRateRowId: item.original.billingRateRowId,
            employeeId: item.original.employeeId,
            staffId: item.original.staffId,
            status: PayslipStatus.IN_REVIEW,
            supersedesPayslipId: item.original.id,
            calculationInputs: item.inputs as unknown as Prisma.InputJsonValue,
            calculationOutputs: item.outputs as unknown as Prisma.InputJsonValue,
            reviewNote: null,
            reviewedAt: null,
            reviewedById: null,
            changedSinceReview: true,
            carriedForward: false,
          },
        });

        replacementPayslipIds[item.original.id] = createdPayslip.id;

        // Rebuild lines from engine output
        for (const line of item.lines) {
          const def = allowanceDefs.find((d) => d.canonicalName === line.canonicalName);
          await tx.payslipLine.create({
            data: {
              payslipId: createdPayslip.id,
              allowanceDefinitionId: def?.id ?? null, // NEVER empty string (F3)
              name: line.name,
              kind: line.kind,
              amount: new Prisma.Decimal(line.amount),
              taxClass: line.taxClass,
              sortOrder: line.sortOrder,
              sourceCell: line.sourceCell ?? null,
            },
          });
        }
      }

      // Insert carried forward payslips
      for (const item of preparedCarriedForward) {
        const createdPayslip = await tx.payslip.create({
          data: {
            payslipBatchId: createdBatch.id,
            billingRateRowId: item.original.billingRateRowId,
            employeeId: item.original.employeeId,
            staffId: item.original.staffId,
            status: PayslipStatus.APPROVED,
            approvedAt: item.original.approvedAt,
            approvedById: item.original.approvedById,
            contentHash: item.original.contentHash,
            supersedesPayslipId: item.original.id,
            calculationInputs: item.original.calculationInputs as Prisma.InputJsonValue,
            calculationOutputs: item.original.calculationOutputs as Prisma.InputJsonValue,
            carriedForward: true,
            changedSinceReview: false,
          },
        });

        replacementPayslipIds[item.original.id] = createdPayslip.id;

        for (const line of item.original.lines) {
          await tx.payslipLine.create({
            data: {
              payslipId: createdPayslip.id,
              allowanceDefinitionId: line.allowanceDefinitionId ?? null,
              name: line.name,
              kind: line.kind,
              amount: line.amount,
              taxClass: line.taxClass,
              sortOrder: line.sortOrder,
              sourceCell: line.sourceCell,
            },
          });
        }
      }

      return createdBatch;
    });

    // Write ONE audit entry PAYSLIP_CORRECTION_VERSION_CREATED
    await this.audit.log({
      actorType: PAYSLIP_AUDIT_ACTOR,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: 'PAYSLIP_CORRECTION_VERSION_CREATED',
      entityType: 'PayslipBatch',
      entityId: newBatch.id,
      metadata: payslipAuditMetadata({
        companyId,
        periodId,
        batchId: newBatch.id,
        version: newBatch.version,
        correctedPayslipIds: preparedCorrected.map((c) => c.original.id),
        carriedForwardCount: preparedCarriedForward.length,
      }),
    });

    return {
      batchId: newBatch.id,
      version: newBatch.version,
      replacementPayslipIds,
      carriedForwardCount: preparedCarriedForward.length,
      correctedCount: preparedCorrected.length,
    };
  }
}
