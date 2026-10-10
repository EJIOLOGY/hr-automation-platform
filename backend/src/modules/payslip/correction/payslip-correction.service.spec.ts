import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { PayslipCorrectionService } from './payslip-correction.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipBatchStatus, PayslipStatus } from '../../../generated/prisma/client';
import { computePayslipContentHash } from '../shared/content-hash';

describe('PayslipCorrectionService', () => {
  let service: PayslipCorrectionService;
  let prisma: any;
  let audit: any;

  beforeEach(async () => {
    const prismaMock = {
      payslip: {
        findUnique: jest.fn(),
      },
      payslipBatch: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      allowanceDefinition: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((fn, _opts) => fn(prismaMock)),
    };

    const auditMock = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayslipCorrectionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<PayslipCorrectionService>(PayslipCorrectionService);
    prisma = module.get(PrismaService);
    audit = module.get(AuditService);
  });

  const originalPayslip1 = {
    id: 'p-1',
    staffId: '1001',
    status: PayslipStatus.APPROVED,
    billingRateRowId: 'row-1',
    employeeId: 'emp-1',
    calculationInputs: { baseFee: 1000, daysWorked: 20, totalDays: 20 },
    calculationOutputs: { consultantGrossPay: 1000, grossEarnings: 1000, wht: 50, netServiceFee: 950 },
    approvedAt: new Date('2026-10-01'),
    approvedById: 'approver-1',
    lines: [],
    contentHash: '',
  };
  originalPayslip1.contentHash = computePayslipContentHash({
    staffId: '1001',
    calculationInputs: originalPayslip1.calculationInputs,
    calculationOutputs: originalPayslip1.calculationOutputs,
    lines: [],
  });

  const originalPayslip2 = {
    id: 'p-2',
    staffId: '1002',
    status: PayslipStatus.APPROVED,
    billingRateRowId: 'row-2',
    employeeId: 'emp-2',
    calculationInputs: { baseFee: 2000, daysWorked: 20, totalDays: 20 },
    calculationOutputs: { consultantGrossPay: 2000, grossEarnings: 2000, wht: 100, netServiceFee: 1900 },
    approvedAt: new Date('2026-10-01'),
    approvedById: 'approver-1',
    lines: [],
    contentHash: '',
  };
  originalPayslip2.contentHash = computePayslipContentHash({
    staffId: '1002',
    calculationInputs: originalPayslip2.calculationInputs,
    calculationOutputs: originalPayslip2.calculationOutputs,
    lines: [],
  });

  const latestBatch = {
    id: 'batch-1',
    accountingCompanyId: 'comp-1',
    payrollPeriodId: 'period-1',
    billingRateUploadId: 'upload-1',
    version: 1,
    status: PayslipBatchStatus.APPROVED,
    payslips: [originalPayslip1, originalPayslip2],
  };

  it('throws 409 NEWER_VERSION_EXISTS if corrected payslip does not belong to latest batch', async () => {
    prisma.payslip.findUnique.mockResolvedValue({
      id: 'p-old',
      payslipBatch: { accountingCompanyId: 'comp-1', payrollPeriodId: 'period-1' },
    });
    prisma.payslipBatch.findFirst.mockResolvedValue(latestBatch);

    await expect(
      service.createCorrectionVersion(
        [{ payslipId: 'p-old', overrides: { daysWorked: 15 } }],
        { actorType: 'HR_OFFICER', actorHrOfficerId: 'u1' },
      ),
    ).rejects.toMatchObject({
      response: { code: 'NEWER_VERSION_EXISTS' },
    });
  });

  it('throws 409 FINISH_APPROVAL_FIRST if latest batch is PARTIALLY_APPROVED', async () => {
    prisma.payslip.findUnique.mockResolvedValue({
      id: 'p-1',
      payslipBatch: { accountingCompanyId: 'comp-1', payrollPeriodId: 'period-1' },
    });
    prisma.payslipBatch.findFirst.mockResolvedValue({
      ...latestBatch,
      status: PayslipBatchStatus.PARTIALLY_APPROVED,
    });

    await expect(
      service.createCorrectionVersion(
        [{ payslipId: 'p-1', overrides: { daysWorked: 15 } }],
        { actorType: 'HR_OFFICER', actorHrOfficerId: 'u1' },
      ),
    ).rejects.toMatchObject({
      response: { code: 'FINISH_APPROVAL_FIRST' },
    });
  });

  it('throws 500 CARRY_FORWARD_INTEGRITY if stored hash differs from recomputed hash', async () => {
    prisma.payslip.findUnique.mockResolvedValue({
      id: 'p-1',
      payslipBatch: { accountingCompanyId: 'comp-1', payrollPeriodId: 'period-1' },
    });

    // Tampered contentHash on p-2
    const tamperedBatch = {
      ...latestBatch,
      payslips: [
        originalPayslip1,
        { ...originalPayslip2, contentHash: 'tampered-hash' },
      ],
    };
    prisma.payslipBatch.findFirst.mockResolvedValue(tamperedBatch);

    await expect(
      service.createCorrectionVersion(
        [{ payslipId: 'p-1', overrides: { daysWorked: 15 } }],
        { actorType: 'HR_OFFICER', actorHrOfficerId: 'u1' },
      ),
    ).rejects.toMatchObject({
      response: { code: 'CARRY_FORWARD_INTEGRITY' },
    });
  });

  it('creates exactly one successor batch with carried-forward and corrected payslips', async () => {
    prisma.payslip.findUnique.mockResolvedValue({
      id: 'p-1',
      payslipBatch: { accountingCompanyId: 'comp-1', payrollPeriodId: 'period-1' },
    });
    prisma.payslipBatch.findFirst.mockResolvedValue(latestBatch);

    const txMock = {
      payslipBatch: {
        create: jest.fn().mockResolvedValue({ id: 'batch-v2', version: 2 }),
      },
      payslip: {
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'new-p1' })
          .mockResolvedValueOnce({ id: 'new-p2' }),
      },
      payslipLine: {
        create: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation((fn: any) => fn(txMock));

    const res = await service.createCorrectionVersion(
      [{ payslipId: 'p-1', overrides: { daysWorked: 15 } }],
      { actorType: 'HR_OFFICER', actorHrOfficerId: 'u1' },
    );

    expect(res.batchId).toBe('batch-v2');
    expect(res.version).toBe(2);
    expect(res.correctedCount).toBe(1);
    expect(res.carriedForwardCount).toBe(1);
    expect(txMock.payslipBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 2,
          status: PayslipBatchStatus.PARTIALLY_APPROVED,
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PAYSLIP_CORRECTION_VERSION_CREATED',
        metadata: expect.objectContaining({
          version: 2,
          carriedForwardCount: 1,
        }),
      }),
    );
  });
});
