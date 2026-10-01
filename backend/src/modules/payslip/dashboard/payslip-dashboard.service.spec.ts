import { Test, TestingModule } from '@nestjs/testing';
import { PayslipDashboardService } from './payslip-dashboard.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipStatus } from '../../../generated/prisma/client';

describe('PayslipDashboardService', () => {
  let service: PayslipDashboardService;
  let prisma: jest.Mocked<PrismaService>;
  let audit: jest.Mocked<AuditService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayslipDashboardService,
        {
          provide: PrismaService,
          useValue: {
            payrollPeriod: {
              findMany: jest.fn(),
            },
            payslip: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            $transaction: jest.fn((cb) => cb(prisma)),
            payslipLine: {
              deleteMany: jest.fn(),
              create: jest.fn(),
            },
            allowanceDefinition: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PayslipDashboardService>(PayslipDashboardService);
    prisma = module.get(PrismaService) as any;
    audit = module.get(AuditService) as any;
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
      ] as any);

      const result = await service.getPeriodRollup();
      expect(result).toHaveLength(1);
      expect(result[0].totalPayslips).toBe(2);
      expect(result[0].approvedPayslips).toBe(1);
      expect(result[0].totalNetServiceFee).toBe(800);
    });
  });

  describe('correctSinglePayslip', () => {
    it('should recalculate and update payslip', async () => {
      prisma.payslip.findUnique.mockResolvedValue({
        id: 'p1',
        calculationInputs: { baseFee: 1000, daysWorked: 10, totalDays: 20 },
        lines: [],
      } as any);

      prisma.allowanceDefinition.findMany.mockResolvedValue([]);
      prisma.payslip.update.mockResolvedValue({ id: 'p1' } as any);

      const result = await service.correctSinglePayslip('p1', { daysWorked: 15 }, { actorType: 'HR', actorHrOfficerId: 'hr-1' });
      expect(result.id).toBe('p1');
      expect(prisma.payslipLine.deleteMany).toHaveBeenCalled();
      expect(prisma.payslip.update).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PAYSLIP_CORRECTED' }));
    });
  });
});
