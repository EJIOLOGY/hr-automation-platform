import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppPayslipService } from './whatsapp-payslip.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PayslipStatus } from '../../../generated/prisma/client';

describe('WhatsAppPayslipService', () => {
  let service: WhatsAppPayslipService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppPayslipService,
        {
          provide: PrismaService,
          useValue: {
            payslip: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<WhatsAppPayslipService>(WhatsAppPayslipService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('getLatestApprovedPayslip', () => {
    it('returns null when no approved payslip exists', async () => {
      jest.spyOn(prisma.payslip, 'findFirst').mockResolvedValue(null);

      const result = await service.getLatestApprovedPayslip('EMP001');

      expect(result).toBeNull();
      expect(prisma.payslip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            staffId: 'EMP001',
            status: PayslipStatus.APPROVED,
          },
        }),
      );
    });

    it('returns PayslipSummaryForWhatsApp from DB record with calculationOutputs', async () => {
      const mockPayslip = {
        id: 'slip-1',
        staffId: 'EMP001',
        status: PayslipStatus.APPROVED,
        calculationOutputs: {
          netServiceFee: 786508.8,
          grossEarnings: 827904.0,
          wht: 41395.2,
        },
        payslipBatch: {
          payrollPeriod: {
            month: 'September',
            year: 2026,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        employeeId: 'emp-1',
        payslipBatchId: 'batch-1',
      };

      jest.spyOn(prisma.payslip, 'findFirst').mockResolvedValue(mockPayslip as any);

      const result = await service.getLatestApprovedPayslip('EMP001');

      expect(result).toEqual({
        payslipId: 'slip-1',
        month: 'September',
        year: 2026,
        netServiceFee: 786508.8,
        grossEarnings: 827904.0,
        wht: 41395.2,
        status: PayslipStatus.APPROVED,
      });
    });
  });

  describe('formatPayslipMessage', () => {
    it('formats currency correctly', () => {
      const summary = {
        payslipId: 'slip-1',
        month: 'September',
        year: 2026,
        netServiceFee: 786508.8,
        grossEarnings: 827904.0,
        wht: 41395.2,
        status: 'APPROVED',
      };

      const result = service.formatPayslipMessage(summary, {
        month: 'September',
        year: 2026,
      });

      expect(result).toContain('💰 *Your Payslip - September 2026*');
      expect(result).toContain('Consultant Gross Pay: ₦827,904.00');
      expect(result).toContain('Gross Earnings: ₦827,904.00');
      expect(result).toContain('WHT (5%): ₦41,395.20');
      expect(result).toContain('*Net Service Fee: ₦786,508.80*');
      expect(result).toContain('Type *1* to download PDF or *0* for main menu.');
    });
  });
});
