import { Test, TestingModule } from '@nestjs/testing';
import { PayslipDashboardService } from './payslip-dashboard.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipCorrectionService } from '../correction/payslip-correction.service';
import { PayslipStatus } from '../../../generated/prisma/client';

describe('PayslipDashboardService', () => {
  let service: PayslipDashboardService;
  let prisma: any;
  let audit: any;
  let correctionService: any;

  beforeEach(async () => {
    const prismaMock = {
      payrollPeriod: {
        findMany: jest.fn(),
      },
      payslipBatch: {
        findFirst: jest.fn(),
      },
      payslip: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payslipLine: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      allowanceDefinition: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((cb, _opts) => cb(prismaMock)),
    };

    const auditMock = { log: jest.fn() };
    const correctionServiceMock = {
      createCorrectionVersion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayslipDashboardService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
        { provide: PayslipCorrectionService, useValue: correctionServiceMock },
      ],
    }).compile();

    service = module.get<PayslipDashboardService>(PayslipDashboardService);
    prisma = module.get(PrismaService);
    audit = module.get(AuditService);
    correctionService = module.get(PayslipCorrectionService);
  });

  describe('getPeriodRollup', () => {
    it('should return correct rollup', async () => {
      prisma.payrollPeriod.findMany.mockResolvedValue([
        {
          id: 'period-1',
          payslipBatches: [
            {
              id: 'batch-1',
              accountingCompanyId: 'comp-1',
              accountingCompany: { id: 'comp-1', name: 'Company A' },
              payslips: [
                { id: 'p1', status: PayslipStatus.APPROVED, calculationOutputs: { netServiceFee: 500 } },
                { id: 'p2', status: PayslipStatus.CALCULATED, calculationOutputs: { netServiceFee: 300 } },
              ],
            },
          ],
        },
      ]);

      const result = await service.getPeriodRollup();
      expect(result).toHaveLength(1);
      expect(result[0].totalPayslips).toBe(2);
      expect(result[0].approvedPayslips).toBe(1);
      expect(result[0].totalNetServiceFee).toBe(800);
    });
  });

  describe('correctSinglePayslip', () => {
    it('recalculates and updates non-approved payslip in-place', async () => {
      const payslip = {
        id: 'p1',
        payslipBatchId: 'batch-1',
        status: PayslipStatus.IN_REVIEW,
        calculationInputs: { baseFee: 1000, daysWorked: 10, totalDays: 20 },
        lines: [],
        payslipBatch: {
          id: 'batch-1',
          accountingCompanyId: 'comp-1',
          payrollPeriodId: 'period-1',
        },
      };
      prisma.payslip.findUnique.mockResolvedValue(payslip);
      prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-1', version: 1 });
      prisma.allowanceDefinition.findMany.mockResolvedValue([]);
      prisma.payslip.update.mockResolvedValue({ id: 'p1', status: PayslipStatus.CALCULATED });

      const result = (await service.correctSinglePayslip(
        'p1',
        { daysWorked: 15 },
        { actorType: 'HR_OFFICER', actorHrOfficerId: 'hr-1' },
      )) as any;

      expect(result.id).toBe('p1');
      expect(prisma.payslipLine.deleteMany).toHaveBeenCalled();
      expect(prisma.payslip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PayslipStatus.CALCULATED,
            changedSinceReview: true,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PAYSLIP_CORRECTED' }));
    });

    it('delegates to PayslipCorrectionService when payslip is APPROVED', async () => {
      const payslip = {
        id: 'p-appr',
        payslipBatchId: 'batch-1',
        status: PayslipStatus.APPROVED,
        calculationInputs: { baseFee: 1000, daysWorked: 20, totalDays: 20 },
        lines: [],
        payslipBatch: {
          id: 'batch-1',
          accountingCompanyId: 'comp-1',
          payrollPeriodId: 'period-1',
        },
      };
      prisma.payslip.findUnique.mockResolvedValue(payslip);
      correctionService.createCorrectionVersion.mockResolvedValue({
        batchId: 'batch-2',
        version: 2,
        replacementPayslipIds: { 'p-appr': 'p-new-1' },
      });

      const result = (await service.correctSinglePayslip(
        'p-appr',
        { daysWorked: 18 },
        { actorType: 'HR_OFFICER', actorHrOfficerId: 'hr-1' },
      )) as any;

      expect(correctionService.createCorrectionVersion).toHaveBeenCalledWith(
        [{ payslipId: 'p-appr', overrides: { daysWorked: 18 } }],
        expect.objectContaining({ actorHrOfficerId: 'hr-1' }),
      );
      expect(result).toEqual({ batchId: 'batch-2', payslipId: 'p-new-1' });
    });
  });
});
