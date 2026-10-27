import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ReviewWorkbookPreviewService } from './review-workbook-preview.service';
import { computeBatchStateHash } from './review-workbook.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BATCH_ID = 'batch-1';
const PREVIEW_ID = 'preview-1';
const EXPORT_HASH = 'export-hash-1';
const ACTOR = { actorType: 'HR_OFFICER', actorHrOfficerId: 'officer-1' };

const HEADERS = [
  'PayslipID', 'StaffID', 'ReviewStatus', 'EmployeeName', 'JobTitle', 'Department',
  'DaysWorked', 'TotalDays', 'DaysAbsent', 'BaseFee', 'OtherDeduction',
  'GrossPay', 'GrossEarnings', 'WHT', 'NetServiceFee', 'ReviewNotes', 'HRDecision', 'Flags',
];

function payslip(id: string, staffId: string, status = 'CALCULATED') {
  return {
    id,
    staffId,
    status,
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    reviewedAt: null as Date | null,
    calculationInputs: {
      staffId, baseFee: 1000, daysWorked: 20, totalDays: 20, otherDeduction: 0, allowances: {}, arrears: {},
    },
    calculationOutputs: {
      baseFee: 1000, daysWorked: 20, totalDays: 20, daysAbsent: 0, consultantGrossPay: 1000, grossEarnings: 1000,
      wht: 50, otherDeduction: 0, totalDeductions: 50, netServiceFee: 950,
    },
  };
}

function makeBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: BATCH_ID,
    version: 1,
    status: 'IN_REVIEW',
    accountingCompanyId: 'company-1',
    payrollPeriodId: 'period-1',
    payslips: [payslip('p-1', 'EMP001'), payslip('p-2', 'EMP002')],
    ...overrides,
  };
}

type Row = Partial<Record<(typeof HEADERS)[number], string | number>>;

async function buildWorkbook(opts: {
  rows: Row[];
  headers?: string[];
  lineRows?: Array<Array<string | number>>;
  meta?: Record<string, string | number> | null;
}): Promise<Buffer> {
  const batch = makeBatch();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Payslips');
  const headers = opts.headers ?? HEADERS;
  ws.addRow(headers);
  for (const r of opts.rows) ws.addRow(headers.map((h) => r[h] ?? ''));
  if (opts.lineRows) {
    const wl = wb.addWorksheet('LineItems');
    wl.addRow(['StaffID', 'LineName', 'Kind', 'TaxClass', 'Amount']);
    for (const l of opts.lineRows) wl.addRow(l);
  }
  if (opts.meta !== null) {
    const m = wb.addWorksheet('__meta');
    m.state = 'veryHidden';
    const meta = {
      batchId: BATCH_ID,
      batchVersion: 1,
      exportHash: EXPORT_HASH,
      batchStateHash: computeBatchStateHash(batch.payslips as never),
      exportedAt: '2026-10-01T10:00:00.000Z',
      ...(opts.meta ?? {}),
    };
    for (const [k, v] of Object.entries(meta)) m.addRow([k, v]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function codeOf(err: unknown): string | undefined {
  const res = (err as HttpException).getResponse?.() as { code?: string } | undefined;
  return res?.code;
}

async function rejection(p: Promise<unknown>): Promise<HttpException> {
  try {
    await p;
  } catch (e) {
    return e as HttpException;
  }
  throw new Error('expected a rejection');
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

function makeHarness() {
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    reviewWorkbookPreview: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    reviewWorkbook: { update: jest.fn().mockResolvedValue({}) },
    payslipBatch: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ status: 'IN_REVIEW' }),
    },
    payslip: {
      update: jest.fn().mockResolvedValue({}),
      groupBy: jest.fn().mockResolvedValue([{ status: 'CALCULATED', _count: 2 }]),
    },
    payslipLine: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
    allowanceDefinition: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma: any = {
    payslipBatch: { findUnique: jest.fn(), findFirst: jest.fn() },
    reviewWorkbook: { findUnique: jest.fn() },
    reviewWorkbookPreview: { create: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    allowanceDefinition: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const decisions = { recordReviewDecisions: jest.fn().mockResolvedValue({}) };
  const service = new ReviewWorkbookPreviewService(prisma, audit as never, decisions as never);

  const batch = makeBatch();
  prisma.payslipBatch.findUnique.mockResolvedValue(batch);
  prisma.payslipBatch.findFirst.mockResolvedValue({ id: BATCH_ID, version: 1 });
  prisma.reviewWorkbook.findUnique.mockResolvedValue({ id: 'wb-1', payslipBatchId: BATCH_ID });
  prisma.reviewWorkbookPreview.create.mockImplementation(async ({ data }: any) => ({ id: PREVIEW_ID, ...data }));
  tx.payslipBatch.findUnique.mockResolvedValue(batch);
  tx.payslipBatch.findFirst.mockResolvedValue({ id: BATCH_ID, version: 1 });
  return { service, prisma, tx, audit, decisions, batch };
}

// ─── Preview ─────────────────────────────────────────────────────────────────

describe('ReviewWorkbookPreviewService.previewWorkbook', () => {
  it('404 when the batch does not exist', async () => {
    const h = makeHarness();
    h.prisma.payslipBatch.findUnique.mockResolvedValue(null);
    await expect(h.service.previewWorkbook(BATCH_ID, await buildWorkbook({ rows: [] }), ACTOR)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 NEWER_VERSION_EXISTS when a newer batch exists for the company and period', async () => {
    const h = makeHarness();
    h.prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-2', version: 2 });
    const err = await rejection(h.service.previewWorkbook(BATCH_ID, await buildWorkbook({ rows: [] }), ACTOR));
    expect(codeOf(err)).toBe('NEWER_VERSION_EXISTS');
  });

  it('409 BATCH_NOT_REVIEWABLE when the batch is fully approved', async () => {
    const h = makeHarness();
    h.prisma.payslipBatch.findUnique.mockResolvedValue(makeBatch({ status: 'APPROVED' }));
    const err = await rejection(h.service.previewWorkbook(BATCH_ID, await buildWorkbook({ rows: [] }), ACTOR));
    expect(codeOf(err)).toBe('BATCH_NOT_REVIEWABLE');
  });

  it('400 INVALID_WORKBOOK_FILE for bytes that are not a workbook', async () => {
    const h = makeHarness();
    const err = await rejection(h.service.previewWorkbook(BATCH_ID, Buffer.from('not a workbook'), ACTOR));
    expect(codeOf(err)).toBe('INVALID_WORKBOOK_FILE');
  });

  it('400 WORKBOOK_META_INVALID when the hidden meta sheet is missing', async () => {
    const h = makeHarness();
    const err = await rejection(h.service.previewWorkbook(BATCH_ID, await buildWorkbook({ rows: [], meta: null }), ACTOR));
    expect(codeOf(err)).toBe('WORKBOOK_META_INVALID');
  });

  it('409 WORKBOOK_WRONG_BATCH for a workbook exported from another batch (e.g. another company)', async () => {
    const h = makeHarness();
    const buf = await buildWorkbook({ rows: [], meta: { batchId: 'other-batch' } });
    expect(codeOf(await rejection(h.service.previewWorkbook(BATCH_ID, buf, ACTOR)))).toBe('WORKBOOK_WRONG_BATCH');
    const wrongVersion = await buildWorkbook({ rows: [], meta: { batchVersion: 7 } });
    expect(codeOf(await rejection(h.service.previewWorkbook(BATCH_ID, wrongVersion, ACTOR)))).toBe('WORKBOOK_WRONG_BATCH');
  });

  it('409 WORKBOOK_UNKNOWN_EXPORT when the export hash is not one the system issued for this batch', async () => {
    const h = makeHarness();
    h.prisma.reviewWorkbook.findUnique.mockResolvedValue(null);
    expect(codeOf(await rejection(h.service.previewWorkbook(BATCH_ID, await buildWorkbook({ rows: [] }), ACTOR)))).toBe('WORKBOOK_UNKNOWN_EXPORT');
    h.prisma.reviewWorkbook.findUnique.mockResolvedValue({ id: 'wb-9', payslipBatchId: 'another-batch' });
    expect(codeOf(await rejection(h.service.previewWorkbook(BATCH_ID, await buildWorkbook({ rows: [] }), ACTOR)))).toBe('WORKBOOK_UNKNOWN_EXPORT');
  });

  it('409 WORKBOOK_STALE when the batch changed since the export', async () => {
    const h = makeHarness();
    const buf = await buildWorkbook({ rows: [], meta: { batchStateHash: 'an-older-state' } });
    expect(codeOf(await rejection(h.service.previewWorkbook(BATCH_ID, buf, ACTOR)))).toBe('WORKBOOK_STALE');
  });

  it('rejects the legacy layout (no PayslipID column) outright', async () => {
    const h = makeHarness();
    const legacy = HEADERS.filter((c) => c !== 'PayslipID');
    const buf = await buildWorkbook({ rows: [{ StaffID: 'EMP001', HRDecision: 'APPROVE' }], headers: legacy });
    const err = await rejection(h.service.previewWorkbook(BATCH_ID, buf, ACTOR));
    expect(codeOf(err)).toBe('WORKBOOK_PARSE_ERRORS');
    expect(JSON.stringify((err.getResponse() as any).details.errors)).toContain('MISSING_COLUMN');
  });

  it('finds columns by header name, so a different column order still works', async () => {
    const h = makeHarness();
    const reordered = [...HEADERS].reverse();
    const buf = await buildWorkbook({ rows: [{ PayslipID: 'p-1', StaffID: 'EMP001', DaysWorked: 10 }], headers: reordered });
    const res = await h.service.previewWorkbook(BATCH_ID, buf, ACTOR);
    expect(res.applicable).toBe(true);
    expect(res.rows[0].changes).toEqual([{ field: 'daysWorked', previous: 20, next: 10 }]);
  });

  it('shows an edit with the recalculated figures and stores only the plan', async () => {
    const h = makeHarness();
    const buf = await buildWorkbook({ rows: [{ PayslipID: 'p-1', StaffID: 'EMP001', DaysWorked: 10 }] });
    const res = await h.service.previewWorkbook(BATCH_ID, buf, ACTOR);

    expect(res.applicable).toBe(true);
    expect(res.previewId).toBe(PREVIEW_ID);
    expect(res.summary).toMatchObject({ changed: 1, invalid: 0, netServiceFeeDelta: '-475.00' });
    expect(res.rows[0]).toMatchObject({
      staffId: 'EMP001',
      status: 'CHANGED',
      netServiceFeeBefore: '950.00',
      netServiceFeeAfter: '475.00',
    });

    const stored = h.prisma.reviewWorkbookPreview.create.mock.calls[0][0].data;
    expect(stored.payload).toEqual({
      version: 2,
      edits: [{ payslipId: 'p-1', staffId: 'EMP001', overrides: { daysWorked: 10 }, allowances: {}, arrears: {} }],
      decisions: [],
    });
    expect(stored.reviewWorkbookId).toBe('wb-1');
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60 * 1000);
    expect(h.audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PAYSLIP_WORKBOOK_PREVIEW_CREATED' }));
  });

  it('recalculates Other Deduction and Base Fee edits', async () => {
    const h = makeHarness();
    const buf = await buildWorkbook({
      rows: [
        { PayslipID: 'p-1', StaffID: 'EMP001', OtherDeduction: 100 },
        { PayslipID: 'p-2', StaffID: 'EMP002', BaseFee: 2000 },
      ],
    });
    const res = await h.service.previewWorkbook(BATCH_ID, buf, ACTOR);
    expect(res.rows.find((r) => r.staffId === 'EMP001')).toMatchObject({ netServiceFeeAfter: '850.00' });
    expect(res.rows.find((r) => r.staffId === 'EMP002')).toMatchObject({ netServiceFeeAfter: '1900.00' });
  });

  it('treats a value equal to the current one as no change', async () => {
    const h = makeHarness();
    const buf = await buildWorkbook({
      rows: [{ PayslipID: 'p-1', StaffID: 'EMP001', DaysWorked: 20, TotalDays: 20, DaysAbsent: 0, BaseFee: 1000, OtherDeduction: 0, HRDecision: 'APPROVE' }],
    });
    const res = await h.service.previewWorkbook(BATCH_ID, buf, ACTOR);
    expect(res.rows[0]).toMatchObject({ status: 'DECISION_ONLY', changes: [] });
    expect(res.summary).toMatchObject({ changed: 0, decisionOnly: 1 });
  });

  it('picks up allowance amount edits from the LineItems sheet and recalculates', async () => {
    const h = makeHarness();
    const buf = await buildWorkbook({
      rows: [{ PayslipID: 'p-1', StaffID: 'EMP001' }],
      lineRows: [['EMP001', 'transportAllowance', 'BASE', 'EXEMPT', 150]],
    });
    const res = await h.service.previewWorkbook(BATCH_ID, buf, ACTOR);
    expect(res.errors).toEqual([]);
    expect(res.rows[0].changes).toEqual([{ field: 'allowance.transportAllowance', previous: 0, next: 150 }]);
    expect(h.prisma.reviewWorkbookPreview.create.mock.calls[0][0].data.payload.edits[0].allowances).toEqual({ transportAllowance: 150 });
  });

  it('puts an arrears line edit into the arrears map', async () => {
    const h = makeHarness();
    const buf = await buildWorkbook({
      rows: [{ PayslipID: 'p-1', StaffID: 'EMP001' }],
      lineRows: [['EMP001', 'arrearsTransportAllowance', 'ARREARS', 'EXEMPT', 40]],
    });
    await h.service.previewWorkbook(BATCH_ID, buf, ACTOR);
    const edit = h.prisma.reviewWorkbookPreview.create.mock.calls[0][0].data.payload.edits[0];
    expect(edit.arrears).toEqual({ arrearsTransportAllowance: 40 });
    expect(edit.allowances).toEqual({});
  });

  it('reports every problem together, creates no preview and is not applicable', async () => {
    const h = makeHarness();
    const buf = await buildWorkbook({
      rows: [
        { PayslipID: 'p-1', StaffID: 'EMP001', BaseFee: -5 },
        { PayslipID: 'p-2', StaffID: 'EMP002', DaysWorked: 'abc' },
        { PayslipID: 'p-1', StaffID: 'EMP001' },
        { PayslipID: 'zzz', StaffID: 'EMP999' },
      ],
    });
    const res = await h.service.previewWorkbook(BATCH_ID, buf, ACTOR);
    expect(res.applicable).toBe(false);
    expect(res.previewId).toBeNull();
    const codes = res.errors.map((e) => e.code).sort();
    expect(codes).toEqual(['DUPLICATE_STAFF_ID', 'INVALID_NUMBER', 'NEGATIVE_NUMBER', 'UNKNOWN_STAFF_ID']);
    expect(res.errors.every((e) => typeof e.row === 'number' && e.row >= 2)).toBe(true);
    expect(h.prisma.reviewWorkbookPreview.create).not.toHaveBeenCalled();
  });

  it.each([
    ['TotalDays of zero', { TotalDays: 0 }, 'TOTAL_DAYS_NOT_POSITIVE'],
    ['DaysWorked above TotalDays', { DaysWorked: 25 }, 'DAYS_WORKED_EXCEEDS_TOTAL'],
  ])('rejects %s', async (_label, edit, code) => {
    const h = makeHarness();
    const buf = await buildWorkbook({ rows: [{ PayslipID: 'p-1', StaffID: 'EMP001', ...edit }] });
    const res = await h.service.previewWorkbook(BATCH_ID, buf, ACTOR);
    expect(res.applicable).toBe(false);
    expect(res.errors.map((e) => e.code)).toContain(code);
  });

  it('rejects a PayslipID that does not belong to the Staff ID on the row (tampered or foreign row)', async () => {
    const h = makeHarness();
    const buf = await buildWorkbook({ rows: [{ PayslipID: 'p-2', StaffID: 'EMP001', DaysWorked: 10 }] });
    const res = await h.service.previewWorkbook(BATCH_ID, buf, ACTOR);
    expect(res.errors.map((e) => e.code)).toContain('PAYSLIP_ID_MISMATCH');
  });

  it('requires a note for HOLD and REJECT and rejects unknown decisions', async () => {
    const h = makeHarness();
    const buf = await buildWorkbook({
      rows: [
        { PayslipID: 'p-1', StaffID: 'EMP001', HRDecision: 'HOLD' },
        { PayslipID: 'p-2', StaffID: 'EMP002', HRDecision: 'MAYBE' },
      ],
    });
    const res = await h.service.previewWorkbook(BATCH_ID, buf, ACTOR);
    expect(res.errors.map((e) => e.code).sort()).toEqual(['NOTE_REQUIRED', 'UNKNOWN_DECISION']);
  });

  it('refuses edits to an approved payslip (FINISH_APPROVAL_FIRST) and decisions on one', async () => {
    const h = makeHarness();
    h.prisma.payslipBatch.findUnique.mockResolvedValue(makeBatch({
      status: 'PARTIALLY_APPROVED',
      payslips: [payslip('p-1', 'EMP001', 'APPROVED'), payslip('p-2', 'EMP002', 'APPROVED')],
    }));
    const batch = makeBatch({ payslips: [payslip('p-1', 'EMP001', 'APPROVED'), payslip('p-2', 'EMP002', 'APPROVED')] });
    const buf = await buildWorkbook({
      rows: [
        { PayslipID: 'p-1', StaffID: 'EMP001', DaysWorked: 10 },
        { PayslipID: 'p-2', StaffID: 'EMP002', HRDecision: 'APPROVE' },
      ],
      meta: { batchStateHash: computeBatchStateHash(batch.payslips as never) },
    });
    const res = await h.service.previewWorkbook(BATCH_ID, buf, ACTOR);
    expect(res.errors.map((e) => e.code).sort()).toEqual(['FINISH_APPROVAL_FIRST', 'PAYSLIP_APPROVED_IMMUTABLE']);
    expect(res.summary.affectsApproved).toBe(2);
  });

  it('refuses edits to a rejected payslip unless the row is a RESET', async () => {
    const h = makeHarness();
    const rejected = [payslip('p-1', 'EMP001', 'REJECTED'), payslip('p-2', 'EMP002')];
    h.prisma.payslipBatch.findUnique.mockResolvedValue(makeBatch({ payslips: rejected }));
    const hash = computeBatchStateHash(rejected as never);

    const bad = await buildWorkbook({ rows: [{ PayslipID: 'p-1', StaffID: 'EMP001', DaysWorked: 10 }], meta: { batchStateHash: hash } });
    expect((await h.service.previewWorkbook(BATCH_ID, bad, ACTOR)).errors.map((e) => e.code)).toContain('REJECTED_PAYSLIP_EDIT');

    const ok = await buildWorkbook({ rows: [{ PayslipID: 'p-1', StaffID: 'EMP001', DaysWorked: 10, HRDecision: 'RESET' }], meta: { batchStateHash: hash } });
    expect((await h.service.previewWorkbook(BATCH_ID, ok, ACTOR)).applicable).toBe(true);
  });

  it('LineItems edits for a Staff ID without a Payslips row are an error, never silently dropped', async () => {
    const h = makeHarness();
    const buf = await buildWorkbook({
      rows: [{ PayslipID: 'p-1', StaffID: 'EMP001', DaysWorked: 10 }],
      lineRows: [['EMP002', 'transportAllowance', 'BASE', 'EXEMPT', 99]],
    });
    const res = await h.service.previewWorkbook(BATCH_ID, buf, ACTOR);
    expect(res.errors.map((e) => e.code)).toContain('LINE_EDIT_WITHOUT_PAYSLIP_ROW');
  });

  it('400 when there is nothing to apply', async () => {
    const h = makeHarness();
    const buf = await buildWorkbook({ rows: [{ PayslipID: 'p-1', StaffID: 'EMP001' }] });
    await expect(h.service.previewWorkbook(BATCH_ID, buf, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── Apply ───────────────────────────────────────────────────────────────────

describe('ReviewWorkbookPreviewService.applyWorkbook', () => {
  function storedPreview(h: ReturnType<typeof makeHarness>, over: Record<string, unknown> = {}) {
    const preview = {
      id: PREVIEW_ID,
      payslipBatchId: BATCH_ID,
      reviewWorkbookId: 'wb-1',
      createdById: ACTOR.actorHrOfficerId,
      batchStateHash: computeBatchStateHash(h.batch.payslips as never),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      appliedAt: null,
      result: null,
      payload: {
        version: 2,
        edits: [{ payslipId: 'p-1', staffId: 'EMP001', overrides: { daysWorked: 10 }, allowances: { transportAllowance: 150 }, arrears: {} }],
        decisions: [{ payslipId: 'p-1', staffId: 'EMP001', decision: 'REVIEWED' }],
      },
      ...over,
    };
    h.prisma.reviewWorkbookPreview.findUnique.mockResolvedValue(preview);
    return preview;
  }

  it('404 for an unknown preview, 400 for another batch, 403 for another officer', async () => {
    const h = makeHarness();
    h.prisma.reviewWorkbookPreview.findUnique.mockResolvedValue(null);
    await expect(h.service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    storedPreview(h, { payslipBatchId: 'other' });
    await expect(h.service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    storedPreview(h, { createdById: 'someone-else' });
    await expect(h.service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('410 PREVIEW_EXPIRED when the preview is past its expiry', async () => {
    const h = makeHarness();
    storedPreview(h, { expiresAt: new Date(Date.now() - 1000) });
    const err = await rejection(h.service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR));
    expect(err.getStatus()).toBe(410);
    expect(codeOf(err)).toBe('PREVIEW_EXPIRED');
  });

  it('is idempotent: an already applied preview returns the stored result and changes nothing', async () => {
    const h = makeHarness();
    const result = { applied: true, counts: { recalculated: 1, decisions: 1, correctionPayslips: 0 } };
    storedPreview(h, { appliedAt: new Date(), result });
    await expect(h.service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)).resolves.toEqual(result);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a preview in the old payload format', async () => {
    const h = makeHarness();
    storedPreview(h, { payload: [{ payslipId: 'p-1', decision: 'REVIEWED' }] });
    expect(codeOf(await rejection(h.service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)))).toBe('WORKBOOK_STALE');
  });

  it('recalculates and persists inputs, outputs and line items, then records decisions in the same transaction', async () => {
    const h = makeHarness();
    storedPreview(h);
    const res = await h.service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR);

    // Locks the batch and claims the preview once.
    expect(h.tx.$queryRaw).toHaveBeenCalled();
    expect(h.tx.reviewWorkbookPreview.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: PREVIEW_ID, appliedAt: null }) }),
    );

    // Payslip: new inputs merged with the edit, recalculated outputs, back to CALCULATED for re-review.
    const update = h.tx.payslip.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'p-1' });
    expect(update.data.calculationInputs).toMatchObject({ daysWorked: 10, totalDays: 20, baseFee: 1000, allowances: { transportAllowance: 150 } });
    expect(update.data.calculationOutputs).toMatchObject({ consultantGrossPay: 500, grossEarnings: 500, wht: 25, netServiceFee: 625 });
    expect(update.data.calculationOutputs.lines).toBeUndefined();
    expect(update.data).toMatchObject({ status: 'CALCULATED', approvedAt: null, reviewedAt: null, reviewedById: null });

    // Line items replaced.
    expect(h.tx.payslipLine.deleteMany).toHaveBeenCalledWith({ where: { payslipId: 'p-1' } });
    const created = h.tx.payslipLine.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ payslipId: 'p-1', name: expect.any(String) });
    expect(Number(created[0].amount)).toBe(150);

    // Decisions run on the same transaction (atomic with the edits).
    const [batchId, dto, actor, options] = h.decisions.recordReviewDecisions.mock.calls[0];
    expect(batchId).toBe(BATCH_ID);
    expect(dto).toEqual({ expectedVersion: 1, decisions: [{ payslipId: 'p-1', decision: 'REVIEWED', note: undefined }] });
    expect(actor).toEqual({ id: 'officer-1' });
    expect(options.tx).toBe(h.tx);

    // Result stored on the preview, returned, and audited without any pay figures.
    expect(res).toMatchObject({ applied: true, previewId: PREVIEW_ID, counts: { recalculated: 1, decisions: 1, correctionPayslips: 0 } });
    expect(h.tx.reviewWorkbookPreview.update).toHaveBeenCalledWith(expect.objectContaining({ data: { result: expect.objectContaining({ applied: true }) } }));
    const audit = h.audit.log.mock.calls[0][0];
    expect(audit.action).toBe('PAYSLIP_REVIEW_WORKBOOK_APPLIED');
    expect(JSON.stringify(audit.metadata)).not.toMatch(/625|baseFee|netServiceFee/);
  });

  it('keeps a recalculated payslip that had been reviewed flagged as changed since review', async () => {
    const h = makeHarness();
    const reviewed = { ...payslip('p-1', 'EMP001', 'IN_REVIEW'), reviewedAt: new Date('2026-10-02') };
    h.batch.payslips = [reviewed, payslip('p-2', 'EMP002')];
    h.tx.payslipBatch.findUnique.mockResolvedValue(h.batch);
    storedPreview(h, { payload: { version: 2, edits: [{ payslipId: 'p-1', staffId: 'EMP001', overrides: { baseFee: 1200 }, allowances: {}, arrears: {} }], decisions: [] } });
    await h.service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR);
    expect(h.tx.payslip.update.mock.calls[0][0].data.changedSinceReview).toBe(true);
    expect(h.decisions.recordReviewDecisions).not.toHaveBeenCalled();
  });

  it('409 WORKBOOK_STALE and no writes when the batch changed after the preview', async () => {
    const h = makeHarness();
    storedPreview(h, { batchStateHash: 'state-at-preview-time' });
    expect(codeOf(await rejection(h.service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)))).toBe('WORKBOOK_STALE');
    expect(h.tx.payslip.update).not.toHaveBeenCalled();
    expect(h.decisions.recordReviewDecisions).not.toHaveBeenCalled();
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('re-checks that the batch is still the latest version and open for review inside the transaction', async () => {
    const h = makeHarness();
    storedPreview(h);
    h.tx.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-2', version: 2 });
    expect(codeOf(await rejection(h.service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)))).toBe('NEWER_VERSION_EXISTS');
    h.tx.payslipBatch.findFirst.mockResolvedValue({ id: BATCH_ID, version: 1 });
    h.tx.payslipBatch.findUnique.mockResolvedValue({ ...h.batch, status: 'APPROVED' });
    expect(codeOf(await rejection(h.service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)))).toBe('BATCH_NOT_REVIEWABLE');
    expect(h.tx.payslip.update).not.toHaveBeenCalled();
  });

  it('a concurrent apply that lost the race returns the first result instead of applying twice', async () => {
    const h = makeHarness();
    storedPreview(h);
    h.tx.reviewWorkbookPreview.updateMany.mockResolvedValue({ count: 0 });
    h.tx.reviewWorkbookPreview.findUnique.mockResolvedValue({ appliedAt: new Date(), expiresAt: new Date(Date.now() + 1000) });
    const first = { applied: true, counts: { recalculated: 1, decisions: 1, correctionPayslips: 0 } };
    h.prisma.reviewWorkbookPreview.findUniqueOrThrow.mockResolvedValue({ id: PREVIEW_ID, payslipBatchId: BATCH_ID, result: first });

    await expect(h.service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)).resolves.toEqual(first);
    expect(h.tx.payslip.update).not.toHaveBeenCalled();
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('410 when the preview expires between the check and the claim', async () => {
    const h = makeHarness();
    storedPreview(h);
    h.tx.reviewWorkbookPreview.updateMany.mockResolvedValue({ count: 0 });
    h.tx.reviewWorkbookPreview.findUnique.mockResolvedValue({ appliedAt: null, expiresAt: new Date(Date.now() - 1) });
    expect(codeOf(await rejection(h.service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)))).toBe('PREVIEW_EXPIRED');
  });

  it('refuses to edit a payslip that is approved at apply time', async () => {
    const h = makeHarness();
    h.batch.payslips = [payslip('p-1', 'EMP001', 'APPROVED'), payslip('p-2', 'EMP002')];
    h.tx.payslipBatch.findUnique.mockResolvedValue(h.batch);
    storedPreview(h, { batchStateHash: computeBatchStateHash(h.batch.payslips as never) });
    expect(codeOf(await rejection(h.service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)))).toBe('PAYSLIP_APPROVED_IMMUTABLE');
    expect(h.tx.payslip.update).not.toHaveBeenCalled();
  });
});
