import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { payslipError } from '../shared/payslip-error-codes';
import { computePayslipFlags } from '../shared/flags';

export interface ReviewActor {
  actorType: string;
  actorHrOfficerId: string;
}

export const REVIEW_WORKBOOK_META_SHEET = '__meta';

/**
 * Deterministic hash of the current batch state: sha256 over the payslips sorted by id as
 * `payslipId|status|updatedAt(ISO)`. Any edit, decision or approval changes `updatedAt`, so a workbook or
 * preview built on an older state is detected as stale.
 */
export function computeBatchStateHash(
  payslips: Array<{ id: string; status: string; updatedAt: Date }>,
): string {
  const sorted = [...payslips].sort((a, b) => a.id.localeCompare(b.id));
  const payload = sorted
    .map((p) => `${p.id}|${p.status}|${p.updatedAt.toISOString()}`)
    .join('\n');
  return createHash('sha256').update(payload).digest('hex');
}

@Injectable()
export class ReviewWorkbookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async exportReviewWorkbook(
    batchId: string,
    actor: ReviewActor,
  ): Promise<Buffer> {
    const batch = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
      include: {
        accountingCompany: true,
        payrollPeriod: true,
        payslips: {
          include: {
            employee: {
              select: { fullName: true, jobTitle: true, department: true },
            },
            lines: { include: { allowanceDefinition: true } },
          },
          orderBy: { staffId: 'asc' },
        },
      },
    });

    if (!batch) throw new NotFoundException('Batch not found');

    // Sheet protection is a convenience (it stops accidental edits of locked columns), not a security control.
    // There is deliberately no default: the password comes from the environment only.
    const password = process.env['PAYSLIP_REVIEW_WORKBOOK_PROTECTION_PASSWORD'];
    if (!password) {
      throw payslipError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'CONFIG_ERROR',
        'PAYSLIP_REVIEW_WORKBOOK_PROTECTION_PASSWORD is not configured, so the review workbook cannot be exported.',
      );
    }

    const exportedAt = new Date();
    const batchStateHash = computeBatchStateHash(batch.payslips);
    // Unique per export; stored on the ReviewWorkbook row and embedded in the hidden meta sheet so an uploaded
    // file can be tied back to exactly this export.
    const exportHash = createHash('sha256')
      .update(
        `${batchId}|${batch.version}|${batchStateHash}|${exportedAt.toISOString()}|${randomUUID()}`,
      )
      .digest('hex');

    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Payslips
    // Column layout (1-indexed):
    //  1  PayslipID   – locked, hidden (identity key for import)
    //  2  StaffID     – locked
    //  3  ReviewStatus – locked (current status snapshot)
    //  4  EmployeeName – locked
    //  5  JobTitle    – locked
    //  6  Department  – locked
    //  7  DaysWorked  – EDITABLE
    //  8  TotalDays   – EDITABLE
    //  9  DaysAbsent  – EDITABLE
    // 10  BaseFee     – EDITABLE
    // 11  OtherDeduction – EDITABLE
    // 12  GrossPay    – locked
    // 13  GrossEarnings – locked
    // 14  WHT         – locked
    // 15  NetServiceFee – locked
    // 16  ReviewNotes – EDITABLE
    // 17  HRDecision  – EDITABLE
    // 18  Flags       – locked (flag codes computed at export time)
    const EDITABLE_COLS = new Set([7, 8, 9, 10, 11, 16, 17]);

    const ws = workbook.addWorksheet('Payslips');
    ws.columns = [
      { header: 'PayslipID', key: 'payslipId', width: 5, hidden: true },
      { header: 'StaffID', key: 'staffId', width: 15 },
      { header: 'ReviewStatus', key: 'reviewStatus', width: 15 },
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
      { header: 'Flags', key: 'flags', width: 20 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFAAAAAA' },
    };

    for (const payslip of batch.payslips) {
      const outputs =
        (payslip.calculationOutputs as Record<string, unknown>) || {};
      const inputs =
        (payslip.calculationInputs as Record<string, unknown>) || {};
      const flags = computePayslipFlags(
        {
          netServiceFee: Number(outputs['netServiceFee'] ?? 0),
          daysWorked: Number(inputs['daysWorked'] ?? 0),
          totalDays: Number(inputs['totalDays'] ?? 0),
          otherDeduction: Number(inputs['otherDeduction'] ?? 0),
          changedSinceReview: payslip.changedSinceReview ?? false,
        },
        null, // no previous approved payslip lookup during export
        20, // default threshold — overridden by PayslipSettings in approval flow
      );
      const flagDisplay = flags.map((f) => f.code).join(', ');

      const row = ws.addRow({
        payslipId: payslip.id,
        staffId: payslip.staffId,
        reviewStatus: payslip.status,
        employeeName: payslip.employee?.fullName ?? '',
        jobTitle: payslip.employee?.jobTitle ?? '',
        department: payslip.employee?.department ?? '',
        daysWorked: Number(inputs['daysWorked'] ?? 0),
        totalDays: Number(inputs['totalDays'] ?? 0),
        daysAbsent: Number(outputs['daysAbsent'] ?? inputs['daysAbsent'] ?? 0),
        baseFee: Number(inputs['baseFee'] ?? 0),
        otherDeduction: Number(inputs['otherDeduction'] ?? 0),
        grossPay: Number(outputs['consultantGrossPay'] ?? 0),
        grossEarnings: Number(outputs['grossEarnings'] ?? 0),
        wht: Number(outputs['wht'] ?? 0),
        netServiceFee: Number(outputs['netServiceFee'] ?? 0),
        reviewNotes: '',
        hrDecision: '',
        flags: flagDisplay,
      });

      row.getCell('hrDecision').dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"APPROVE,REJECT,HOLD"'],
      };
    }

    // Apply cell protection before sheet-level protect call
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.protection = { locked: !EDITABLE_COLS.has(colNumber) };
      });
    });

    await ws.protect(password, {
      selectLockedCells: true,
      selectUnlockedCells: true,
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
    await wsLines.protect(password, {
      selectLockedCells: true,
      selectUnlockedCells: true,
    });

    // Very hidden meta sheet: binds the file to this batch, version, state and export.
    const wsMeta = workbook.addWorksheet(REVIEW_WORKBOOK_META_SHEET);
    wsMeta.state = 'veryHidden';
    wsMeta.addRows([
      ['batchId', batchId],
      ['batchVersion', batch.version],
      ['exportHash', exportHash],
      ['batchStateHash', batchStateHash],
      ['exportedAt', exportedAt.toISOString()],
    ]);

    const buf = Buffer.from(await workbook.xlsx.writeBuffer());

    await this.prisma.reviewWorkbook.create({
      data: {
        payslipBatchId: batchId,
        exportHash,
        exportedAt,
        batchVersion: batch.version,
        batchStateHash,
        exportedById: actor.actorHrOfficerId,
      },
    });

    await this.audit.log({
      actorType: actor.actorType,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: 'PAYSLIP_REVIEW_WORKBOOK_EXPORTED',
      entityType: 'PAYSLIP_BATCH',
      entityId: batchId,
      metadata: { exportHash, batchVersion: batch.version, batchStateHash },
    });

    return buf;
  }
}
