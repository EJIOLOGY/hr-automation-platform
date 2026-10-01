import { Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipStatus, Prisma } from '../../../generated/prisma/client';

export interface ReviewActor { actorType: string; actorHrOfficerId: string; }
export interface ReviewImportResult {
  workbookId: string;
  approved: number;
  rejected: number;
  held: number;
  diff: Array<{ staffId: string; decision: string; notes: string | null }>;
}

function cellToString(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val).trim();
  if (typeof val === 'object' && 'text' in (val as object)) return String((val as { text: unknown }).text ?? '').trim();
  return '';
}

@Injectable()
export class ReviewWorkbookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
        if (colNumber === 11 || colNumber === 12) {
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
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.protection = { locked: true };
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
      diff: [],
    };

    const updates: Array<{ staffId: string, decision: 'APPROVE' | 'REJECT' | 'HOLD', notes: string }> = [];

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const staffId = cellToString(row.getCell(1).value);
      const notes = cellToString(row.getCell(11).value);
      const rawDecision = cellToString(row.getCell(12).value).toUpperCase();

      if (['APPROVE', 'REJECT', 'HOLD'].includes(rawDecision) && staffId) {
        updates.push({
          staffId,
          decision: rawDecision as 'APPROVE' | 'REJECT' | 'HOLD',
          notes,
        });
      }
    });

    await this.prisma.$transaction(async (tx) => {
      for (const update of updates) {
        let status: PayslipStatus = PayslipStatus.CALCULATED;
        const reviewData = { decision: update.decision, notes: update.notes };

        if (update.decision === 'APPROVE') {
          status = PayslipStatus.APPROVED;
          result.approved++;
          await tx.payslip.updateMany({
            where: { payslipBatchId: batchId, staffId: update.staffId },
            data: {
              status,
              approvedAt: new Date(),
              reviewData: reviewData as Prisma.InputJsonValue,
            },
          });
        } else if (update.decision === 'REJECT') {
          status = PayslipStatus.CALCULATED;
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
        });
      }

      await tx.reviewWorkbook.update({
        where: { id: latestWorkbook.id },
        data: {
          reuploadedAt: new Date(),
          diff: result.diff as Prisma.InputJsonValue,
        },
      });
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
