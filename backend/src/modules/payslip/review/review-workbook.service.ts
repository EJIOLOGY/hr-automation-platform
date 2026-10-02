import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipBatchStatus, PayslipStatus, Prisma } from '../../../generated/prisma/client';
import { calculatePayslip, CANONICAL_ALLOWANCES } from '../calculation/calculation-engine';
import type { CalculationInputs } from '../calculation/calculation.types';
import { PayslipDashboardService } from '../dashboard/payslip-dashboard.service';

export interface ReviewActor { actorType: string; actorHrOfficerId: string; }
export interface ReviewImportResult {
  workbookId: string;
  approved: number;
  rejected: number;
  held: number;
  correctionBatchIds: string[];
  diff: Array<{ staffId: string; decision: string; notes: string | null; changes: Record<string, { from: number; to: number }> }>;
}

function cellToString(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val).trim();
  if (typeof val === 'object' && 'text' in (val as object)) return String((val as { text: unknown }).text ?? '').trim();
  return '';
}

function optionalMoney(value: ExcelJS.CellValue, field: string): number | undefined {
  const text = cellToString(value);
  if (!text) return undefined;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new BadRequestException(`${field} must be a non-negative number.`);
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class ReviewWorkbookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dashboard: PayslipDashboardService,
  ) {}

  async exportReviewWorkbook(batchId: string, actor: ReviewActor): Promise<Buffer> {
    const batch = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
      include: {
        accountingCompany: true,
        payrollPeriod: true,
        payslips: {
          include: {
            employee: { select: { fullName: true, jobTitle: true, department: true } },
            lines: { include: { allowanceDefinition: true } },
          },
        },
      },
    });

    if (!batch) throw new NotFoundException('Batch not found');

    const workbook = new ExcelJS.Workbook();
    
    // Sheet 1: Payslips
    const ws = workbook.addWorksheet('Payslips');
    ws.columns = [
      { header: 'StaffID', key: 'staffId', width: 15 },
      { header: 'EmployeeName', key: 'employeeName', width: 25 },
      { header: 'JobTitle', key: 'jobTitle', width: 20 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'DaysWorked', key: 'daysWorked', width: 15 },
      { header: 'TotalDays', key: 'totalDays', width: 15 },
      { header: 'DaysAbsent', key: 'daysAbsent', width: 15 },
      { header: 'BaseFee', key: 'baseFee', width: 15 },
      { header: 'OtherDeduction', key: 'otherDeduction', width: 18 },
      { header: 'GrossPay', key: 'grossPay', width: 15 },
      { header: 'GrossEarnings', key: 'grossEarnings', width: 15 },
      { header: 'WHT', key: 'wht', width: 15 },
      { header: 'NetServiceFee', key: 'netServiceFee', width: 15 },
      { header: 'ReviewNotes', key: 'reviewNotes', width: 30 },
      { header: 'HRDecision', key: 'hrDecision', width: 15 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFAAAAAA' } };

    for (const payslip of batch.payslips) {
      const outputs = (payslip.calculationOutputs as Record<string, unknown>) || {};
      const inputs = (payslip.calculationInputs as Record<string, unknown>) || {};
      
      const row = ws.addRow({
        staffId: payslip.staffId,
        employeeName: payslip.employee?.fullName ?? '',
        jobTitle: payslip.employee?.jobTitle ?? '',
        department: payslip.employee?.department ?? '',
        daysWorked: Number(inputs['daysWorked'] ?? 0),
        totalDays: Number(inputs['totalDays'] ?? 0),
        daysAbsent: Number(inputs['daysAbsent'] ?? 0),
        baseFee: Number(inputs['baseFee'] ?? 0),
        otherDeduction: Number(inputs['otherDeduction'] ?? 0),
        grossPay: Number(outputs['consultantGrossPay'] ?? 0),
        grossEarnings: Number(outputs['grossEarnings'] ?? 0),
        wht: Number(outputs['wht'] ?? 0),
        netServiceFee: Number(outputs['netServiceFee'] ?? 0),
        reviewNotes: '',
        hrDecision: '',
      });

      row.getCell('hrDecision').dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"APPROVE,REJECT,HOLD"'],
      };
    }

    await ws.protect('hrreview2026', { selectLockedCells: true, selectUnlockedCells: true });

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if ([5, 6, 7, 8, 14, 15].includes(colNumber)) {
          cell.protection = { locked: false };
        } else {
          cell.protection = { locked: true };
        }
      });
    });

    // Sheet 2: LineItems
    const wsLines = workbook.addWorksheet('LineItems');
    wsLines.columns = [
      { header: 'StaffID', key: 'staffId', width: 15 },
      { header: 'LineName', key: 'lineName', width: 25 },
      { header: 'Kind', key: 'kind', width: 15 },
      { header: 'TaxClass', key: 'taxClass', width: 15 },
      { header: 'Amount', key: 'amount', width: 15 },
    ];

    for (const payslip of batch.payslips) {
      for (const line of payslip.lines) {
        wsLines.addRow({
          staffId: payslip.staffId,
          lineName: line.allowanceDefinition?.canonicalName ?? 'Unknown',
          kind: line.kind,
          taxClass: line.taxClass,
          amount: Number(line.amount),
        });
      }
    }

    wsLines.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.protection = { locked: rowNumber === 1 || colNumber !== 5 };
      });
    });
    await wsLines.protect('hrreview2026', { selectLockedCells: true, selectUnlockedCells: true });

    const buf = Buffer.from(await workbook.xlsx.writeBuffer());
    const exportHash = createHash('sha256').update(buf).digest('hex');

    await this.prisma.reviewWorkbook.create({
      data: {
        payslipBatchId: batchId,
        exportHash,
        exportedAt: new Date(),
      },
    });

    await this.audit.log({
      actorType: actor.actorType,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: 'PAYSLIP_REVIEW_WORKBOOK_EXPORTED',
      entityType: 'PAYSLIP_BATCH',
      entityId: batchId,
      metadata: { exportHash },
    });

    return buf;
  }

  async importReviewWorkbook(batchId: string, buffer: Buffer, actor: ReviewActor): Promise<ReviewImportResult> {
    const latestWorkbook = await this.prisma.reviewWorkbook.findFirst({
      where: { payslipBatchId: batchId },
      orderBy: { exportedAt: 'desc' },
    });

    if (!latestWorkbook) {
      throw new NotFoundException('No review workbook exported for this batch');
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const ws = wb.getWorksheet('Payslips');
    if (!ws) throw new NotFoundException('Payslips sheet not found');

    const result: ReviewImportResult = {
      workbookId: latestWorkbook.id,
      approved: 0,
      rejected: 0,
      held: 0,
      correctionBatchIds: [],
      diff: [],
    };

    const allowanceOverrides = new Map<string, Record<string, number>>();
    const lineSheet = wb.getWorksheet('LineItems');
    lineSheet?.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const staffId = cellToString(row.getCell(1).value);
      const allowance = cellToString(row.getCell(2).value);
      const amount = optionalMoney(row.getCell(5).value, `Allowance ${allowance}`);
      if (!staffId || amount === undefined) return;
      if (!CANONICAL_ALLOWANCES[allowance]) throw new BadRequestException(`Unsupported allowance ${allowance}.`);
      allowanceOverrides.set(staffId, { ...(allowanceOverrides.get(staffId) ?? {}), [allowance]: amount });
    });

    const updates: Array<{ staffId: string, decision: 'APPROVE' | 'REJECT' | 'HOLD', notes: string, overrides: Record<string, number>, allowanceOverrides: Record<string, number> }> = [];

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const staffId = cellToString(row.getCell(1).value);
      const notes = cellToString(row.getCell(14).value);
      const rawDecision = cellToString(row.getCell(15).value).toUpperCase();

      const overrides = Object.fromEntries(
        Object.entries({
          daysWorked: optionalMoney(row.getCell(5).value, 'DaysWorked'),
          totalDays: optionalMoney(row.getCell(6).value, 'TotalDays'),
          daysAbsent: optionalMoney(row.getCell(7).value, 'DaysAbsent'),
          baseFee: optionalMoney(row.getCell(8).value, 'BaseFee'),
          otherDeduction: optionalMoney(row.getCell(9).value, 'OtherDeduction'),
        }).filter(([, value]) => value !== undefined),
      ) as Record<string, number>;

      const editedAllowances = allowanceOverrides.get(staffId) ?? {};
      if (staffId && (['APPROVE', 'REJECT', 'HOLD'].includes(rawDecision) || Object.keys(overrides).length > 0)) {
        updates.push({
          staffId,
          decision: (['APPROVE', 'REJECT', 'HOLD'].includes(rawDecision) ? rawDecision : 'HOLD') as 'APPROVE' | 'REJECT' | 'HOLD',
          notes,
          overrides,
          allowanceOverrides: editedAllowances,
        });
      }
    });

    // Approved records are immutable.  Move only changed approved rows into a
    // successor batch before importing normal in-review decisions.
    const mutableUpdates: typeof updates = [];
    for (const update of updates) {
      const existing = await this.prisma.payslip.findUnique({ where: { payslipBatchId_staffId: { payslipBatchId: batchId, staffId: update.staffId } } });
      if (!existing) throw new BadRequestException(`Unknown StaffID ${update.staffId} in review workbook.`);
      const inputs = existing.calculationInputs as unknown as CalculationInputs;
      const hasInputChange = Object.entries(update.overrides).some(([field, value]) => Number((inputs as unknown as Record<string, unknown>)[field] ?? 0) !== value)
        || Object.entries(update.allowanceOverrides).some(([field, value]) => Number(({ ...(inputs.allowances ?? {}), ...(inputs.arrears ?? {}) }[field] ?? 0)) !== value);
      if (existing.status === PayslipStatus.APPROVED && hasInputChange) {
        const replacement = await this.dashboard.correctSinglePayslip(existing.id, {
          ...update.overrides,
          allowances: { ...(inputs.allowances ?? {}), ...update.allowanceOverrides },
        }, actor);
        if (!('batchId' in replacement)) throw new ConflictException('Approved correction did not create a successor batch.');
        result.correctionBatchIds.push(replacement.batchId);
        result.diff.push({ staffId: update.staffId, decision: update.decision, notes: update.notes, changes: { versioned: { from: 1, to: 2 } } });
      } else {
        mutableUpdates.push(update);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const update of mutableUpdates) {
        const payslip = await tx.payslip.findUnique({ where: { payslipBatchId_staffId: { payslipBatchId: batchId, staffId: update.staffId } } });
        if (!payslip) throw new BadRequestException(`Unknown StaffID ${update.staffId} in review workbook.`);
        const currentInputs = payslip.calculationInputs as unknown as CalculationInputs;
        const changes: Record<string, { from: number; to: number }> = {};
        for (const [field, value] of Object.entries(update.overrides)) {
          const previous = Number((currentInputs as unknown as Record<string, unknown>)[field] ?? 0);
          if (previous !== value) changes[field] = { from: previous, to: value };
        }
        const updatedAllowances = { ...(currentInputs.allowances ?? {}) };
        const updatedArrears = { ...(currentInputs.arrears ?? {}) };
        for (const [allowance, value] of Object.entries(update.allowanceOverrides)) {
          const target = allowance.startsWith('arrears') ? updatedArrears : updatedAllowances;
          const previous = Number(target[allowance] ?? 0);
          if (previous !== value) changes[`allowance.${allowance}`] = { from: previous, to: value };
          target[allowance] = value;
        }
        if (Object.keys(changes).length > 0) {
          if (update.overrides.totalDays !== undefined && update.overrides.totalDays <= 0) {
            throw new BadRequestException('TotalDays must be greater than zero.');
          }
          const inputs = { ...currentInputs, ...update.overrides, allowances: updatedAllowances, arrears: updatedArrears };
          const calculated = calculatePayslip(inputs, CANONICAL_ALLOWANCES);
          const { lines, ...outputs } = calculated;
          await tx.payslip.update({ where: { id: payslip.id }, data: { calculationInputs: inputs as unknown as Prisma.InputJsonValue, calculationOutputs: outputs as unknown as Prisma.InputJsonValue } });
          await tx.payslipLine.deleteMany({ where: { payslipId: payslip.id } });
          for (const line of lines) await tx.payslipLine.create({ data: { payslipId: payslip.id, name: line.name, kind: line.kind, amount: new Prisma.Decimal(line.amount), taxClass: line.taxClass, sortOrder: line.sortOrder, sourceCell: line.sourceCell } });
        }
        let status: PayslipStatus = PayslipStatus.CALCULATED;
        const reviewData = { decision: update.decision, notes: update.notes };

        if (update.decision === 'APPROVE') {
          status = PayslipStatus.IN_REVIEW;
          result.approved++;
          await tx.payslip.updateMany({
            where: { payslipBatchId: batchId, staffId: update.staffId },
            data: {
              status,
              approvedAt: null,
              reviewData: reviewData as Prisma.InputJsonValue,
            },
          });
        } else if (update.decision === 'REJECT') {
          status = PayslipStatus.REJECTED;
          result.rejected++;
          await tx.payslip.updateMany({
            where: { payslipBatchId: batchId, staffId: update.staffId },
            data: {
              status,
              reviewData: reviewData as Prisma.InputJsonValue,
            },
          });
        } else if (update.decision === 'HOLD') {
          result.held++;
          await tx.payslip.updateMany({
            where: { payslipBatchId: batchId, staffId: update.staffId },
            data: {
              reviewData: reviewData as Prisma.InputJsonValue,
            },
          });
        }

        result.diff.push({
          staffId: update.staffId,
          decision: update.decision,
          notes: update.notes,
          changes,
        });
      }

      await tx.reviewWorkbook.update({
        where: { id: latestWorkbook.id },
        data: {
          reuploadedAt: new Date(),
          diff: result.diff as Prisma.InputJsonValue,
        },
      });
      await tx.payslipBatch.update({ where: { id: batchId }, data: { status: PayslipBatchStatus.IN_REVIEW } });
    });

    await this.audit.log({
      actorType: actor.actorType,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: 'PAYSLIP_REVIEW_WORKBOOK_IMPORTED',
      entityType: 'PAYSLIP_BATCH',
      entityId: batchId,
      metadata: { stats: { approved: result.approved, rejected: result.rejected, held: result.held } },
    });

    return result;
  }
}
