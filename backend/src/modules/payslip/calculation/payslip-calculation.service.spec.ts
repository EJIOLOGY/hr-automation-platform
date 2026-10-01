import { Test, TestingModule } from '@nestjs/testing';
import { PayslipCalculationService } from './payslip-calculation.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  PayslipBatchStatus,
  PayslipStatus,
} from '../../../generated/prisma/client';

type MockFn = jest.Mock;

interface PrismaMock {
  billingRateUpload: { findUnique: MockFn };
  allowanceDefinition: { findMany: MockFn };
  $transaction: MockFn;
  payslipBatch: { findFirst: MockFn; create: MockFn; findUnique: MockFn };
  employee: { findMany: MockFn };
  payslip: { create: MockFn };
  payslipLine: { create: MockFn };
}

describe('PayslipCalculationService', () => {
  let service: PayslipCalculationService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = {
      billingRateUpload: { findUnique: jest.fn() },
      allowanceDefinition: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: PrismaMock) => Promise<unknown>) =>
          cb(prisma),
        ),
      payslipBatch: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'batch-123',
          version: 1,
          status: PayslipBatchStatus.CALCULATED,
        }),
        findUnique: jest.fn(),
      },
      employee: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'emp-1', employeeNumber: '2230355' }]),
      },
      payslip: {
        create: jest.fn().mockResolvedValue({
          id: 'payslip-1',
          status: PayslipStatus.CALCULATED,
        }),
      },
      payslipLine: { create: jest.fn().mockResolvedValue({ id: 'line-1' }) },
    };

    const audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayslipCalculationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<PayslipCalculationService>(PayslipCalculationService);
  });

  it('calculates payslips and line items from a billing rate upload', () => {
    prisma.billingRateUpload.findUnique.mockResolvedValue({
      id: 'upload-1',
      accountingCompanyId: 'comp-1',
      payrollPeriodId: 'period-1',
      rows: [
        {
          id: 'row-1',
          staffId: '2230355',
          normalizedData: {
            baseFee: 776160,
            daysWorked: 31,
            totalDays: 31,
            publicHoliday: 51744,
          },
          validationErrors: [],
        },
      ],
    });

    return expect(
      service.calculateUpload('upload-1', {
        actorType: 'HR_OFFICER',
        actorHrOfficerId: 'officer-1',
      }),
    ).resolves.toMatchObject({
      batchId: 'batch-123',
      version: 1,
      calculatedCount: 1,
      skippedCount: 0,
      totalRows: 1,
    });
  });
});
