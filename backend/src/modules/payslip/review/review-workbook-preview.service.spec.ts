import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ReviewWorkbookPreviewService } from './review-workbook-preview.service';
import { ReviewDecisionService } from './review-decision.service';
import * as ExcelJS from 'exceljs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeWorkbookBuffer(
  rows: Array<{ payslipId?: string; staffId: string; reviewNotes?: string; hrDecision?: string }>,
  useNewLayout = true,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Payslips');

  if (useNewLayout) {
    ws.columns = [
      { header: 'PayslipID', key: 'payslipId' },
      { header: 'StaffID', key: 'staffId' },
      { header: 'ReviewStatus', key: 'reviewStatus' },
      { header: 'EmployeeName', key: 'employeeName' },
      { header: 'JobTitle', key: 'jobTitle' },
      { header: 'Department', key: 'department' },
      { header: 'DaysWorked', key: 'daysWorked' },
      { header: 'TotalDays', key: 'totalDays' },
      { header: 'DaysAbsent', key: 'daysAbsent' },
      { header: 'BaseFee', key: 'baseFee' },
      { header: 'OtherDeduction', key: 'otherDeduction' },
      { header: 'GrossPay', key: 'grossPay' },
      { header: 'GrossEarnings', key: 'grossEarnings' },
      { header: 'WHT', key: 'wht' },
      { header: 'NetServiceFee', key: 'netServiceFee' },
      { header: 'ReviewNotes', key: 'reviewNotes' },
      { header: 'HRDecision', key: 'hrDecision' },
      { header: 'Flags', key: 'flags' },
    ];
    for (const row of rows) {
      ws.addRow({
        payslipId: row.payslipId ?? '',
        staffId: row.staffId,
        reviewNotes: row.reviewNotes ?? '',
        hrDecision: row.hrDecision ?? '',
      });
    }
  } else {
    ws.columns = [
      { header: 'StaffID', key: 'staffId' },
      { header: 'EmployeeName', key: 'employeeName' },
      { header: 'JobTitle', key: 'jobTitle' },
      { header: 'Department', key: 'department' },
      { header: 'DaysWorked', key: 'daysWorked' },
      { header: 'TotalDays', key: 'totalDays' },
      { header: 'DaysAbsent', key: 'daysAbsent' },
      { header: 'BaseFee', key: 'baseFee' },
      { header: 'OtherDeduction', key: 'otherDeduction' },
      { header: 'GrossPay', key: 'grossPay' },
      { header: 'GrossEarnings', key: 'grossEarnings' },
      { header: 'WHT', key: 'wht' },
      { header: 'NetServiceFee', key: 'netServiceFee' },
      { header: 'ReviewNotes', key: 'reviewNotes' },
      { header: 'HRDecision', key: 'hrDecision' },
    ];
    for (const row of rows) {
      ws.addRow({
        staffId: row.staffId,
        reviewNotes: row.reviewNotes ?? '',
        hrDecision: row.hrDecision ?? '',
      });
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  payslipBatch: {
    findUnique: jest.fn(),
  },
  reviewWorkbook: {
    findFirst: jest.fn(),
  },
  reviewWorkbookPreview: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockAudit = { log: jest.fn() };

const mockReviewDecisionService = {
  recordReviewDecisions: jest.fn(),
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BATCH_ID = 'batch-aaa';
const PREVIEW_ID = 'prev-bbb';
const WB_ID = 'wb-ccc';

const PAYSLIP_A = { id: 'ps-001', staffId: 'EMP001', contentHash: 'ha', status: 'CALCULATED' };
const PAYSLIP_B = { id: 'ps-002', staffId: 'EMP002', contentHash: 'hb', status: 'CALCULATED' };

const BATCH_FIXTURE = {
  id: BATCH_ID,
  accountingCompanyId: 'comp-1',
  payrollPeriodId: 'period-1',
  version: 1,
  payslips: [PAYSLIP_A, PAYSLIP_B],
};

const ACTOR = { actorType: 'HR_OFFICER', actorHrOfficerId: 'officer-1' };

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ReviewWorkbookPreviewService', () => {
  let service: ReviewWorkbookPreviewService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ReviewWorkbookPreviewService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: ReviewDecisionService, useValue: mockReviewDecisionService },
      ],
    }).compile();
    service = module.get(ReviewWorkbookPreviewService);
  });

  // ── previewWorkbook ────────────────────────────────────────────────────────

  describe('previewWorkbook', () => {
    it('throws NotFoundException when batch not found', async () => {
      mockPrisma.payslipBatch.findUnique.mockResolvedValue(null);
      const buf = await makeWorkbookBuffer([]);
      await expect(service.previewWorkbook('bad-id', buf, ACTOR)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when no workbook has been exported', async () => {
      mockPrisma.payslipBatch.findUnique.mockResolvedValue(BATCH_FIXTURE);
      const buf = await makeWorkbookBuffer([
        { payslipId: PAYSLIP_A.id, staffId: PAYSLIP_A.staffId, hrDecision: 'APPROVE' },
      ]);
      mockPrisma.reviewWorkbook.findFirst.mockResolvedValue(null);
      await expect(service.previewWorkbook(BATCH_ID, buf, ACTOR)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException on empty decision set', async () => {
      mockPrisma.payslipBatch.findUnique.mockResolvedValue(BATCH_FIXTURE);
      const buf = await makeWorkbookBuffer([]); // no data rows
      await expect(service.previewWorkbook(BATCH_ID, buf, ACTOR)).rejects.toThrow(BadRequestException);
    });

    it('returns preview with correct decision counts (new layout)', async () => {
      mockPrisma.payslipBatch.findUnique.mockResolvedValue(BATCH_FIXTURE);
      mockPrisma.reviewWorkbook.findFirst.mockResolvedValue({ id: WB_ID });
      const createdPreview = { id: PREVIEW_ID, expiresAt: new Date(Date.now() + 600_000) };
      mockPrisma.reviewWorkbookPreview.create.mockResolvedValue(createdPreview);

      const buf = await makeWorkbookBuffer([
        { payslipId: PAYSLIP_A.id, staffId: PAYSLIP_A.staffId, hrDecision: 'APPROVE' },
        { payslipId: PAYSLIP_B.id, staffId: PAYSLIP_B.staffId, hrDecision: 'HOLD', reviewNotes: 'Check please' },
      ]);
      const result = await service.previewWorkbook(BATCH_ID, buf, ACTOR);

      expect(result.previewId).toBe(PREVIEW_ID);
      expect(result.counts.reviewed).toBe(1);
      expect(result.counts.held).toBe(1);
      expect(result.decisions).toHaveLength(2);
    });

    it('maps REJECT decision and validates note requirement', async () => {
      mockPrisma.payslipBatch.findUnique.mockResolvedValue(BATCH_FIXTURE);
      const buf = await makeWorkbookBuffer([
        { payslipId: PAYSLIP_A.id, staffId: PAYSLIP_A.staffId, hrDecision: 'REJECT', reviewNotes: '' }, // missing note
      ]);
      await expect(service.previewWorkbook(BATCH_ID, buf, ACTOR)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'WORKBOOK_PARSE_ERRORS' }),
      });
    });

    it('falls back to staffId lookup for old-layout workbooks', async () => {
      mockPrisma.payslipBatch.findUnique.mockResolvedValue(BATCH_FIXTURE);
      mockPrisma.reviewWorkbook.findFirst.mockResolvedValue({ id: WB_ID });
      const createdPreview = { id: PREVIEW_ID, expiresAt: new Date(Date.now() + 600_000) };
      mockPrisma.reviewWorkbookPreview.create.mockResolvedValue(createdPreview);

      // old layout: staffId in col 1, no payslipId
      const buf = await makeWorkbookBuffer(
        [{ staffId: PAYSLIP_A.staffId, hrDecision: 'APPROVE' }],
        false, // old layout
      );
      const result = await service.previewWorkbook(BATCH_ID, buf, ACTOR);
      expect(result.counts.reviewed).toBe(1);
    });

    it('emits audit log after successful preview creation', async () => {
      mockPrisma.payslipBatch.findUnique.mockResolvedValue(BATCH_FIXTURE);
      mockPrisma.reviewWorkbook.findFirst.mockResolvedValue({ id: WB_ID });
      const createdPreview = { id: PREVIEW_ID, expiresAt: new Date(Date.now() + 600_000) };
      mockPrisma.reviewWorkbookPreview.create.mockResolvedValue(createdPreview);
      const buf = await makeWorkbookBuffer([
        { payslipId: PAYSLIP_A.id, staffId: PAYSLIP_A.staffId, hrDecision: 'APPROVE' },
      ]);
      await service.previewWorkbook(BATCH_ID, buf, ACTOR);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYSLIP_WORKBOOK_PREVIEW_CREATED' }),
      );
    });
  });

  // ── applyWorkbook ──────────────────────────────────────────────────────────

  describe('applyWorkbook', () => {
    it('throws NotFoundException when preview not found', async () => {
      mockPrisma.reviewWorkbookPreview.findUnique.mockResolvedValue(null);
      await expect(service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when preview belongs to different batch', async () => {
      mockPrisma.reviewWorkbookPreview.findUnique.mockResolvedValue({
        id: PREVIEW_ID,
        payslipBatchId: 'other-batch',
        expiresAt: new Date(Date.now() + 600_000),
        batchStateHash: 'old',
        payload: [],
      });
      await expect(service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)).rejects.toThrow(BadRequestException);
    });

    it('throws PREVIEW_EXPIRED when preview is past expiry', async () => {
      mockPrisma.reviewWorkbookPreview.findUnique.mockResolvedValue({
        id: PREVIEW_ID,
        payslipBatchId: BATCH_ID,
        expiresAt: new Date(Date.now() - 1000), // expired
        batchStateHash: 'x',
        payload: [],
      });
      await expect(service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PREVIEW_EXPIRED' }),
      });
    });

    it('throws BATCH_CHANGED_SINCE_PREVIEW when batch state changed', async () => {
      // Compute real hash from BATCH_FIXTURE and use a different one in preview
      mockPrisma.reviewWorkbookPreview.findUnique.mockResolvedValue({
        id: PREVIEW_ID,
        payslipBatchId: BATCH_ID,
        expiresAt: new Date(Date.now() + 600_000),
        batchStateHash: 'stale-hash',
        payload: [{ payslipId: PAYSLIP_A.id, staffId: PAYSLIP_A.staffId, decision: 'REVIEWED' }],
      });
      mockPrisma.payslipBatch.findUnique.mockResolvedValue(BATCH_FIXTURE);
      // The real computed hash won't match 'stale-hash'
      await expect(service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BATCH_CHANGED_SINCE_PREVIEW' }),
      });
    });

    it('delegates to ReviewDecisionService and marks preview applied on success', async () => {
      // Compute the same hash as computeBatchStateHash would produce
      const sorted = [...BATCH_FIXTURE.payslips].sort((a, b) => a.staffId.localeCompare(b.staffId));
      const payload = sorted.map((p) => `${p.staffId}:${p.contentHash ?? ''}:${p.status}`).join('|');
      const hash = createHash('sha256').update(payload).digest('hex');

      mockPrisma.reviewWorkbookPreview.findUnique.mockResolvedValue({
        id: PREVIEW_ID,
        payslipBatchId: BATCH_ID,
        expiresAt: new Date(Date.now() + 600_000),
        batchStateHash: hash,
        payload: [{ payslipId: PAYSLIP_A.id, staffId: PAYSLIP_A.staffId, decision: 'REVIEWED' }],
      });
      mockPrisma.payslipBatch.findUnique.mockResolvedValue(BATCH_FIXTURE);
      mockReviewDecisionService.recordReviewDecisions.mockResolvedValue({
        batchId: BATCH_ID,
        batchStatus: 'IN_REVIEW',
        counts: { updated: 1, unchanged: 0 },
        statusCounts: { CALCULATED: 1, IN_REVIEW: 1, HELD: 0, REJECTED: 0, APPROVED: 0 },
      });
      mockPrisma.reviewWorkbookPreview.update.mockResolvedValue({});

      const result = await service.applyWorkbook(BATCH_ID, PREVIEW_ID, ACTOR);
      expect(result.batchStatus).toBe('IN_REVIEW');
      expect(result.counts.updated).toBe(1);
      expect(mockPrisma.reviewWorkbookPreview.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: PREVIEW_ID }, data: expect.objectContaining({ appliedAt: expect.any(Date) }) }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYSLIP_WORKBOOK_PREVIEW_APPLIED' }),
      );
    });
  });
});
