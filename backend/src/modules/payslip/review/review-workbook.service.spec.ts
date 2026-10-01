import { Test, TestingModule } from '@nestjs/testing';
import { ReviewWorkbookService } from './review-workbook.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

describe('ReviewWorkbookService', () => {
  let service: ReviewWorkbookService;
  let prisma: jest.Mocked<PrismaService>;
  let audit: jest.Mocked<AuditService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewWorkbookService,
        {
          provide: PrismaService,
          useValue: {
            payslipBatch: {
              findUnique: jest.fn(),
            },
            reviewWorkbook: {
              create: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
            $transaction: jest.fn((cb) => cb(prisma)),
            payslip: {
              updateMany: jest.fn(),
            },
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReviewWorkbookService>(ReviewWorkbookService);
    prisma = module.get(PrismaService) as any;
    audit = module.get(AuditService) as any;
  });

  describe('exportReviewWorkbook', () => {
    it('should export a workbook and return a buffer', async () => {
      prisma.payslipBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        payslips: [
          {
            id: 'payslip-1',
            staffId: 'EMP001',
            employee: { fullName: 'John Doe', jobTitle: 'Dev', department: 'IT' },
            calculationOutputs: { consultantGrossPay: 1000, grossEarnings: 1000, wht: 100, netServiceFee: 900 },
            calculationInputs: { daysWorked: 20, totalDays: 20 },
            lines: [],
          },
        ],
      } as any);

      const result = await service.exportReviewWorkbook('batch-1', { actorType: 'HR', actorHrOfficerId: 'hr-1' });
      expect(Buffer.isBuffer(result)).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      expect(prisma.reviewWorkbook.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PAYSLIP_REVIEW_WORKBOOK_EXPORTED' }));
    });
  });

  describe('importReviewWorkbook', () => {
    it('should import a workbook and return correct counts', async () => {
      prisma.reviewWorkbook.findFirst.mockResolvedValue({ id: 'rw-1' } as any);

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Payslips');
      ws.addRow(['StaffID', '...', '...', '...', '...', '...', '...', '...', '...', '...', 'ReviewNotes', 'HRDecision']);
      ws.addRow(['EMP001', '', '', '', '', '', '', '', '', '', 'ok', 'APPROVE']);

      const buffer = Buffer.from(await wb.xlsx.writeBuffer());

      const result = await service.importReviewWorkbook('batch-1', buffer, { actorType: 'HR', actorHrOfficerId: 'hr-1' });

      expect(result.approved).toBe(1);
      expect(result.rejected).toBe(0);
      expect(result.held).toBe(0);
      expect(result.diff.length).toBe(1);
      expect(prisma.payslip.updateMany).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PAYSLIP_REVIEW_WORKBOOK_IMPORTED' }));
    });
  });
});
