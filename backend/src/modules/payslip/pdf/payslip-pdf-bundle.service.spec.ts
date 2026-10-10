jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PayslipPdfBundleService } from './payslip-pdf-bundle.service';
import { PdfGenerationService } from './pdf-generation.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipPdfStatus, PayslipStatus } from '../../../generated/prisma/client';

describe('PayslipPdfBundleService', () => {
  let service: PayslipPdfBundleService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockPdfGen: any;

  beforeEach(async () => {
    mockPrisma = {
      payslipBatch: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      payrollPeriod: {
        findUnique: jest.fn(),
      },
      payslip: {
        findMany: jest.fn(),
      },
    };

    mockAudit = {
      log: jest.fn(),
    };

    mockPdfGen = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayslipPdfBundleService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: PdfGenerationService, useValue: mockPdfGen },
      ],
    }).compile();

    service = module.get<PayslipPdfBundleService>(PayslipPdfBundleService);
  });

  describe('streamBatchBundle', () => {
    it('throws 409 PDF_NOT_READY when approved payslips are not READY', async () => {
      mockPrisma.payslipBatch.findUnique.mockResolvedValue({
        id: 'b1',
        version: 1,
        accountingCompany: { code: 'COMP1', name: 'Company 1' },
        payrollPeriod: { name: '2026-10' },
        payslips: [
          {
            id: 'p1',
            status: PayslipStatus.APPROVED,
            pdf: { status: PayslipPdfStatus.PENDING, blob: null },
          },
        ],
      });

      const res: any = {
        set: jest.fn(),
      };

      await expect(service.streamBatchBundle('b1', res, 'officer-1')).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'PDF_NOT_READY',
          statusCode: 409,
          details: expect.objectContaining({
            pending: 1,
            ready: 0,
          }),
        }),
      });
    });
  });

  describe('getPeriodBundleStatus', () => {
    it('filters only current approved payslips and excludes superseded versions', async () => {
      mockPrisma.payslipBatch.findMany.mockResolvedValue([
        { id: 'b1', accountingCompany: { code: 'C1' } },
        { id: 'b2', accountingCompany: { code: 'C1' } },
      ]);

      mockPrisma.payslip.findMany.mockResolvedValue([
        // p2 is a replacement for p1 (so p1 is superseded)
        {
          id: 'p2',
          staffId: 'EMP001',
          supersedesPayslipId: 'p1',
          status: PayslipStatus.APPROVED,
          createdAt: new Date('2026-10-02'),
          pdf: { status: PayslipPdfStatus.READY, blob: { id: 'blob-2' }, expiresAt: new Date('2026-10-25') },
          payslipBatch: { accountingCompany: { code: 'C1' } },
        },
        {
          id: 'p1',
          staffId: 'EMP001',
          supersedesPayslipId: null,
          status: PayslipStatus.APPROVED,
          createdAt: new Date('2026-10-01'),
          pdf: { status: PayslipPdfStatus.READY, blob: { id: 'blob-1' } },
          payslipBatch: { accountingCompany: { code: 'C1' } },
        },
        // p3 is held (not approved)
        {
          id: 'p3',
          staffId: 'EMP002',
          supersedesPayslipId: null,
          status: PayslipStatus.HELD,
          createdAt: new Date('2026-10-01'),
          pdf: null,
          payslipBatch: { accountingCompany: { code: 'C1' } },
        },
      ]);

      const status = await service.getPeriodBundleStatus('period-1');

      expect(status.included).toBe(1); // Only p2 is current approved
      expect(status.ready).toBe(1);
      expect(status.excludedNotApproved).toBe(1); // p3 is held
      expect(status.earliestExpiry).toBe('2026-10-25T00:00:00.000Z');
    });
  });
});
