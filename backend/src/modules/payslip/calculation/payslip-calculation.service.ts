import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  PayslipBatchStatus,
  PayslipStatus,
  Prisma,
} from '../../../generated/prisma/client';
import {
  AllowanceMetadata,
  CANONICAL_ALLOWANCES,
  calculatePayslip,
} from './calculation-engine';
import { CalculationInputs } from './calculation.types';

export interface CalculationActor {
  actorType: string;
  actorHrOfficerId: string;
}

@Injectable()
export class PayslipCalculationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async calculateUpload(billingRateUploadId: string, actor: CalculationActor) {
    const upload = await this.prisma.billingRateUpload.findUnique({
      where: { id: billingRateUploadId },
      include: {
        accountingCompany: true,
        payrollPeriod: true,
        rows: true,
      },
    });

    if (!upload) {
      throw new NotFoundException('Billing Rate upload not found.');
    }

    if (upload.rows.length === 0) {
      throw new BadRequestException(
        'Billing Rate upload contains no employee rows.',
      );
    }

    // Load active allowance definitions from database (fallback to CANONICAL_ALLOWANCES)
    const dbDefinitions = await this.prisma.allowanceDefinition.findMany();
    const definitionsMap: Record<string, AllowanceMetadata> = {
      ...CANONICAL_ALLOWANCES,
    };

    for (const def of dbDefinitions) {
      definitionsMap[def.canonicalName] = {
        canonicalName: def.canonicalName,
        displayLabel: def.displayLabel,
        classification: def.classification,
        affectsGrossEarnings: def.affectsGrossEarnings,
        affectsNetServiceFee: def.affectsNetServiceFee,
        supportsArrears: def.supportsArrears,
        sortOrder: def.sortOrder,
        parentCanonicalName:
          CANONICAL_ALLOWANCES[def.canonicalName]?.parentCanonicalName,
      };
    }

    return this.prisma.$transaction(async (tx) => {
      // Find latest batch version for this company and period
      const latestBatch = await tx.payslipBatch.findFirst({
        where: {
          accountingCompanyId: upload.accountingCompanyId,
          payrollPeriodId: upload.payrollPeriodId,
        },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const batchVersion = (latestBatch?.version ?? 0) + 1;

      const batch = await tx.payslipBatch.create({
        data: {
          accountingCompanyId: upload.accountingCompanyId,
          payrollPeriodId: upload.payrollPeriodId,
          billingRateUploadId: upload.id,
          version: batchVersion,
          status: PayslipBatchStatus.CALCULATED,
          createdById: actor.actorHrOfficerId,
          calculatedAt: new Date(),
        },
      });

      // Query existing employees to match staffId to employeeId
      const staffIds = upload.rows.map((r) => r.staffId).filter(Boolean);
      const employees = await tx.employee.findMany({
        where: { employeeNumber: { in: staffIds } },
        select: { id: true, employeeNumber: true },
      });
      const employeeMap = new Map<string, string>(
        employees.map((e) => [e.employeeNumber, e.id]),
      );

      let calculatedCount = 0;
      let skippedCount = 0;

      for (const row of upload.rows) {
        const errors = (row.validationErrors as unknown as unknown[]) ?? [];
        if (errors.length > 0 || !row.staffId) {
          skippedCount += 1;
          continue;
        }

        const rawNormalized =
          (row.normalizedData as Record<string, unknown>) ?? {};
        const cellCoords =
          (rawNormalized['_cellCoordinates'] as Record<string, string>) ?? {};

        const baseFee = Number(rawNormalized['baseFee'] ?? 0);
        const totalDays = Number(rawNormalized['totalDays'] ?? 0);
        const daysWorked = Number(rawNormalized['daysWorked'] ?? 0);
        const daysAbsent = Number(rawNormalized['daysAbsent'] ?? 0);
        const otherDeduction = Number(rawNormalized['otherDeduction'] ?? 0);

        // Separate base allowances and arrears
        const allowances: Record<string, number> = {};
        const arrears: Record<string, number> = {};

        for (const [key, val] of Object.entries(rawNormalized)) {
          if (key === '_cellCoordinates' || typeof val !== 'number') continue;
          if (key.startsWith('arrears')) {
            arrears[key] = val;
          } else if (
            key !== 'baseFee' &&
            key !== 'totalDays' &&
            key !== 'daysWorked' &&
            key !== 'daysAbsent' &&
            key !== 'loanAdvanceDeduction'
          ) {
            allowances[key] = val;
          }
        }

        const inputs: CalculationInputs = {
          staffId: row.staffId,
          baseFee,
          daysWorked,
          totalDays,
          daysAbsent,
          allowances,
          arrears,
          otherDeduction,
          cellCoordinates: cellCoords,
        };

        const outputs = calculatePayslip(inputs, definitionsMap);
        const matchedEmployeeId = employeeMap.get(row.staffId);

        const payslip = await tx.payslip.create({
          data: {
            payslipBatchId: batch.id,
            billingRateRowId: row.id,
            staffId: row.staffId,
            employeeId: matchedEmployeeId,
            status: PayslipStatus.CALCULATED,
            calculationInputs: inputs as unknown as Prisma.InputJsonValue,
            calculationOutputs: outputs as unknown as Prisma.InputJsonValue,
          },
        });

        // Insert BASE lines first
        const baseLines = outputs.lines.filter((l) => l.kind === 'BASE');
        const createdBaseLineIds = new Map<string, string>();

        for (const line of baseLines) {
          const matchingDef = dbDefinitions.find(
            (d) => d.canonicalName === line.canonicalName,
          );
          const created = await tx.payslipLine.create({
            data: {
              payslipId: payslip.id,
              allowanceDefinitionId: matchingDef?.id ?? null,
              name: line.name,
              kind: line.kind,
              amount: line.amount,
              taxClass: line.taxClass,
              sortOrder: line.sortOrder,
              sourceCell: line.sourceCell,
            },
          });
          createdBaseLineIds.set(line.canonicalName, created.id);
        }

        // Insert ARREARS lines with parentLineId
        const arrearsLines = outputs.lines.filter((l) => l.kind === 'ARREARS');
        for (const line of arrearsLines) {
          const matchingDef = dbDefinitions.find(
            (d) => d.canonicalName === line.canonicalName,
          );
          const parentLineId = line.parentCanonicalName
            ? (createdBaseLineIds.get(line.parentCanonicalName) ?? null)
            : null;

          await tx.payslipLine.create({
            data: {
              payslipId: payslip.id,
              allowanceDefinitionId: matchingDef?.id ?? null,
              name: line.name,
              kind: line.kind,
              parentLineId,
              amount: line.amount,
              taxClass: line.taxClass,
              sortOrder: line.sortOrder,
              sourceCell: line.sourceCell,
            },
          });
        }

        calculatedCount += 1;
      }

      await this.auditService.log({
        actorType: actor.actorType,
        actorHrOfficerId: actor.actorHrOfficerId,
        action: 'PAYSLIP_BATCH_CALCULATED',
        entityType: 'PAYSLIP_BATCH',
        entityId: batch.id,
        metadata: {
          accountingCompanyId: upload.accountingCompanyId,
          payrollPeriodId: upload.payrollPeriodId,
          version: batch.version,
          totalRows: upload.rows.length,
          calculatedCount,
          skippedCount,
        },
      });

      return {
        batchId: batch.id,
        version: batch.version,
        status: batch.status,
        calculatedCount,
        skippedCount,
        totalRows: upload.rows.length,
      };
    });
  }

  async getBatchSummary(batchId: string) {
    const batch = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
      include: {
        accountingCompany: { select: { id: true, name: true, code: true } },
        payrollPeriod: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            month: true,
            year: true,
          },
        },
        payslips: {
          include: {
            lines: true,
            employee: {
              select: {
                id: true,
                fullName: true,
                department: true,
                jobTitle: true,
              },
            },
          },
        },
      },
    });

    if (!batch) throw new NotFoundException('Payslip batch not found.');
    return batch;
  }
}
