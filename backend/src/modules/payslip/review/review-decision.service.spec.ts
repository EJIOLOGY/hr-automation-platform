import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { ReviewDecisionService } from './review-decision.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipBatchStatus, PayslipStatus } from '../../../generated/prisma/client';

describe('ReviewDecisionService', () => {
  let service: ReviewDecisionService;
  let prisma: any;
  let audit: any;

  beforeEach(async () => {
    const prismaMock = {
      payslipBatch: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      payslip: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([
          { status: PayslipStatus.IN_REVIEW, _count: 1 },
          { status: PayslipStatus.CALCULATED, _count: 0 },
          { status: PayslipStatus.HELD, _count: 0 },
          { status: PayslipStatus.REJECTED, _count: 0 },
          { status: PayslipStatus.APPROVED, _count: 0 },
        ]),
      },
      $transaction: jest.fn((fn, _opts) => fn(prismaMock)),
    };

    const auditMock = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewDecisionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<ReviewDecisionService>(ReviewDecisionService);
    prisma = module.get(PrismaService);
    audit = module.get(AuditService);
  });

  const baseBatch = {
    id: 'batch-1',
    accountingCompanyId: 'comp-1',
    payrollPeriodId: 'period-1',
    version: 3,
    status: PayslipBatchStatus.CALCULATED,
  };

  it('throws 409 NEWER_VERSION_EXISTS if batch is not the latest version', async () => {
    prisma.payslipBatch.findUnique.mockResolvedValue(baseBatch);
    prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-2', version: 4 });

    await expect(
      service.recordReviewDecisions(
        'batch-1',
        { expectedVersion: 3, decisions: [{ payslipId: 'p1', decision: 'REVIEWED' }] },
        { id: 'u1' },
      ),
    ).rejects.toMatchObject({
      response: { code: 'NEWER_VERSION_EXISTS' },
    });
  });

  it('throws 409 VERSION_MISMATCH if expectedVersion differs from batch.version', async () => {
    prisma.payslipBatch.findUnique.mockResolvedValue(baseBatch);
    prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-1', version: 3 });

    await expect(
      service.recordReviewDecisions(
        'batch-1',
        { expectedVersion: 2, decisions: [{ payslipId: 'p1', decision: 'REVIEWED' }] },
        { id: 'u1' },
      ),
    ).rejects.toMatchObject({
      response: { code: 'VERSION_MISMATCH' },
    });
  });

  it('throws 409 BATCH_NOT_REVIEWABLE if batch status is APPROVED or REJECTED', async () => {
    prisma.payslipBatch.findUnique.mockResolvedValue({ ...baseBatch, status: PayslipBatchStatus.APPROVED });
    prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-1', version: 3 });

    await expect(
      service.recordReviewDecisions(
        'batch-1',
        { expectedVersion: 3, decisions: [{ payslipId: 'p1', decision: 'REVIEWED' }] },
        { id: 'u1' },
      ),
    ).rejects.toMatchObject({
      response: { code: 'BATCH_NOT_REVIEWABLE' },
    });
  });

  it('fails atomically if HOLD or REJECT lacks note (at least 3 chars)', async () => {
    prisma.payslipBatch.findUnique.mockResolvedValue(baseBatch);
    prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-1', version: 3 });
    prisma.payslip.findMany.mockResolvedValue([
      { id: 'p1', status: PayslipStatus.CALCULATED },
      { id: 'p2', status: PayslipStatus.CALCULATED },
    ]);

    await expect(
      service.recordReviewDecisions(
        'batch-1',
        {
          expectedVersion: 3,
          decisions: [
            { payslipId: 'p1', decision: 'REVIEWED' },
            { payslipId: 'p2', decision: 'HOLD', note: 'no' }, // too short
          ],
        },
        { id: 'u1' },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_FAILED',
        details: {
          errors: expect.arrayContaining([
            expect.objectContaining({ payslipId: 'p2', code: 'NOTE_REQUIRED' }),
          ]),
        },
      },
    });

    // Ensures NOTHING was written
    expect(prisma.payslip.update).not.toHaveBeenCalled();
    expect(prisma.payslip.updateMany).not.toHaveBeenCalled();
  });

  it('fails atomically if payslip is APPROVED (PAYSLIP_APPROVED_IMMUTABLE)', async () => {
    prisma.payslipBatch.findUnique.mockResolvedValue(baseBatch);
    prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-1', version: 3 });
    prisma.payslip.findMany.mockResolvedValue([
      { id: 'p1', status: PayslipStatus.APPROVED },
    ]);

    await expect(
      service.recordReviewDecisions(
        'batch-1',
        {
          expectedVersion: 3,
          decisions: [{ payslipId: 'p1', decision: 'REVIEWED' }],
        },
        { id: 'u1' },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_FAILED',
        details: {
          errors: expect.arrayContaining([
            expect.objectContaining({ payslipId: 'p1', code: 'PAYSLIP_APPROVED_IMMUTABLE' }),
          ]),
        },
      },
    });
  });

  it('applies valid decisions, moves CALCULATED batch to IN_REVIEW, and audits', async () => {
    prisma.payslipBatch.findUnique.mockResolvedValue(baseBatch);
    prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-1', version: 3 });
    prisma.payslip.findMany.mockResolvedValue([
      { id: 'p1', status: PayslipStatus.CALCULATED },
      { id: 'p2', status: PayslipStatus.CALCULATED },
      { id: 'p3', status: PayslipStatus.IN_REVIEW },
    ]);

    const res = await service.recordReviewDecisions(
      'batch-1',
      {
        expectedVersion: 3,
        decisions: [
          { payslipId: 'p1', decision: 'REVIEWED' },
          { payslipId: 'p2', decision: 'HOLD', note: 'Missing tax document' },
          { payslipId: 'p3', decision: 'REVIEWED' }, // no-op on already IN_REVIEW
        ],
      },
      { id: 'u1' },
    );

    expect(res.counts.updated).toBe(2);
    expect(res.counts.unchanged).toBe(1);
    expect(res.batchStatus).toBe(PayslipBatchStatus.IN_REVIEW);
    expect(prisma.payslipBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-1' },
        data: { status: PayslipBatchStatus.IN_REVIEW },
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PAYSLIP_REVIEW_DECISIONS_RECORDED',
        entityId: 'batch-1',
      }),
    );
  });
});
