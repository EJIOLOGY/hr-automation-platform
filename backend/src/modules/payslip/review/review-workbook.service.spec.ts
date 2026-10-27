import { HttpException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ReviewWorkbookService, computeBatchStateHash } from './review-workbook.service';
import { readWorkbookMeta } from './review-workbook-analysis';

const PASSWORD_ENV = 'PAYSLIP_REVIEW_WORKBOOK_PROTECTION_PASSWORD';

function makePayslip(id: string, staffId: string, updatedAt = new Date('2026-10-01T10:00:00Z')) {
  return {
    id,
    staffId,
    status: 'CALCULATED',
    updatedAt,
    contentHash: null,
    employee: { fullName: `Employee ${staffId}`, jobTitle: 'Dev', department: 'IT' },
    calculationOutputs: { consultantGrossPay: 1000, grossEarnings: 1000, wht: 50, netServiceFee: 950, daysAbsent: 0 },
    calculationInputs: { daysWorked: 20, totalDays: 20, baseFee: 1000, otherDeduction: 0 },
    lines: [],
  };
}

describe('ReviewWorkbookService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: ReviewWorkbookService;
  const actor = { actorType: 'HR_OFFICER', actorHrOfficerId: 'hr-1' };

  beforeEach(() => {
    process.env[PASSWORD_ENV] = 'test-password';
    prisma = {
      payslipBatch: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'batch-1',
          version: 3,
          status: 'IN_REVIEW',
          payslips: [makePayslip('p-1', 'EMP001'), makePayslip('p-2', 'EMP002')],
        }),
      },
      reviewWorkbook: { create: jest.fn().mockResolvedValue({}) },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new ReviewWorkbookService(prisma, audit as any);
  });

  afterEach(() => {
    delete process.env[PASSWORD_ENV];
  });

  it('exports a workbook with the current layout and a very hidden meta sheet bound to the batch', async () => {
    const buf = await service.exportReviewWorkbook('batch-1', actor);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const headers = (wb.getWorksheet('Payslips')!.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual(
      expect.arrayContaining(['PayslipID', 'StaffID', 'DaysWorked', 'TotalDays', 'DaysAbsent', 'BaseFee', 'OtherDeduction', 'ReviewNotes', 'HRDecision']),
    );
    expect(wb.getWorksheet('__meta')!.state).toBe('veryHidden');

    const meta = readWorkbookMeta(wb);
    expect(meta.batchId).toBe('batch-1');
    expect(meta.batchVersion).toBe(3);
    expect(meta.batchStateHash).toBe(computeBatchStateHash(prisma.payslipBatch.findUnique.mock.results[0].value ? (await prisma.payslipBatch.findUnique()).payslips : []));

    const created = prisma.reviewWorkbook.create.mock.calls[0][0].data;
    expect(created.exportHash).toBe(meta.exportHash);
    expect(created.batchStateHash).toBe(meta.batchStateHash);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PAYSLIP_REVIEW_WORKBOOK_EXPORTED' }));
  });

  it('gives every export its own export hash', async () => {
    await service.exportReviewWorkbook('batch-1', actor);
    await service.exportReviewWorkbook('batch-1', actor);
    const [a, b] = prisma.reviewWorkbook.create.mock.calls.map((c: any) => c[0].data.exportHash);
    expect(a).not.toBe(b);
  });

  it('refuses to export when the protection password is not configured (no default in source)', async () => {
    delete process.env[PASSWORD_ENV];
    await expect(service.exportReviewWorkbook('batch-1', actor)).rejects.toBeInstanceOf(HttpException);
    try {
      await service.exportReviewWorkbook('batch-1', actor);
    } catch (e) {
      expect((e as HttpException).getResponse()).toMatchObject({ code: 'CONFIG_ERROR' });
    }
    expect(prisma.reviewWorkbook.create).not.toHaveBeenCalled();
  });

  it('exports the effective DaysAbsent, not 0, when it was derived by the calculation', async () => {
    const p = makePayslip('p-3', 'EMP003');
    p.calculationInputs = { daysWorked: 18, totalDays: 20, baseFee: 1000, otherDeduction: 0 } as any;
    p.calculationOutputs = { ...p.calculationOutputs, daysAbsent: 2 };
    prisma.payslipBatch.findUnique.mockResolvedValue({ id: 'batch-1', version: 1, status: 'IN_REVIEW', payslips: [p] });
    const buf = await service.exportReviewWorkbook('batch-1', actor);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Payslips')!;
    const col = (ws.getRow(1).values as unknown[]).indexOf('DaysAbsent');
    expect(ws.getRow(2).getCell(col).value).toBe(2);
  });

  it('no longer has the legacy direct-commit import', () => {
    expect((service as any).importReviewWorkbook).toBeUndefined();
  });

  describe('computeBatchStateHash', () => {
    const t = new Date('2026-10-01T10:00:00Z');
    it('is stable regardless of row order and changes when status or updatedAt changes', () => {
      const a = [{ id: 'a', status: 'CALCULATED', updatedAt: t }, { id: 'b', status: 'IN_REVIEW', updatedAt: t }];
      const reordered = [a[1], a[0]];
      expect(computeBatchStateHash(a)).toBe(computeBatchStateHash(reordered));
      expect(computeBatchStateHash(a)).not.toBe(computeBatchStateHash([{ ...a[0], status: 'HELD' }, a[1]]));
      expect(computeBatchStateHash(a)).not.toBe(computeBatchStateHash([{ ...a[0], updatedAt: new Date('2026-10-02T00:00:00Z') }, a[1]]));
    });
  });
});
