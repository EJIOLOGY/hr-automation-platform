jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PdfGenerationService } from './pdf-generation.service';
import { PdfService } from './pdf.service';
import { PayslipRenderService } from './payslip-render.service';
import { PostgresPayslipPdfStorage } from './payslip-pdf-storage';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipPdfStatus, PayslipStatus } from '../../../generated/prisma/client';

describe('PdfGenerationService', () => {
  let service: PdfGenerationService;
  let mockPrisma: any;
  let mockPdfService: any;
  let mockRenderService: any;
  let mockStorage: any;
  let mockAudit: any;

  beforeEach(async () => {
    mockPrisma = {
      payslipPdf: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      payslip: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    mockPdfService = {
      generatePayslipPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-mock-bytes')),
    };

    mockRenderService = {
      getPayslipData: jest.fn().mockResolvedValue({
        staffId: 'EMP001',
        month: 'OCTOBER',
        year: 2026,
      }),
    };

    mockStorage = {
      put: jest.fn().mockResolvedValue({
        id: 'blob-1',
        contentHash: 'hash-1',
        templateVersion: '1.0.0',
        bytes: Buffer.from('%PDF-mock-bytes'),
        sizeBytes: 15,
        sha256: 'sha-mock',
      }),
      getByHash: jest.fn(),
    };

    mockAudit = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfGenerationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PdfService, useValue: mockPdfService },
        { provide: PayslipRenderService, useValue: mockRenderService },
        { provide: PostgresPayslipPdfStorage, useValue: mockStorage },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<PdfGenerationService>(PdfGenerationService);
  });

  describe('recoverStuckGenerating', () => {
    it('resets payslips left GENERATING for more than 5 minutes to PENDING', async () => {
      mockPrisma.payslipPdf.updateMany.mockResolvedValue({ count: 3 });

      await service.recoverStuckGenerating();

      expect(mockPrisma.payslipPdf.updateMany).toHaveBeenCalledWith({
        where: {
          status: PayslipPdfStatus.GENERATING,
          updatedAt: { lt: expect.any(Date) },
        },
        data: {
          status: PayslipPdfStatus.PENDING,
        },
      });
    });
  });

  describe('getReady', () => {
    it('returns READY with buffer, sha256, sizeBytes when record is ready', async () => {
      mockPrisma.payslipPdf.findUnique.mockResolvedValue({
        status: PayslipPdfStatus.READY,
        blob: {
          bytes: Buffer.from('%PDF-data'),
          sha256: 'sha-123',
          sizeBytes: 9,
        },
      });

      const res = await service.getReady('p1');
      expect(res.status).toBe('READY');
      if (res.status === 'READY') {
        expect(res.bytes).toEqual(Buffer.from('%PDF-data'));
        expect(res.sha256).toBe('sha-123');
        expect(res.sizeBytes).toBe(9);
      }
    });

    it('returns PENDING when record does not exist', async () => {
      mockPrisma.payslipPdf.findUnique.mockResolvedValue(null);
      const res = await service.getReady('p1');
      expect(res.status).toBe('PENDING');
    });

    it('returns actual non-ready status when record is not ready', async () => {
      mockPrisma.payslipPdf.findUnique.mockResolvedValue({
        status: PayslipPdfStatus.GENERATING,
        blob: null,
      });
      const res = await service.getReady('p1');
      expect(res.status).toBe('GENERATING');
    });
  });

  describe('pin', () => {
    it('raises expiresAt to at least now + minDays for ready PDFs', async () => {
      mockPrisma.payslipPdf.updateMany.mockResolvedValue({ count: 5 });

      await service.pin(['p1', 'p2'], 3);

      expect(mockPrisma.payslipPdf.updateMany).toHaveBeenCalledWith({
        where: {
          payslipId: { in: ['p1', 'p2'] },
          status: PayslipPdfStatus.READY,
          expiresAt: { lt: expect.any(Date) },
        },
        data: {
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('carried-forward reuse without re-rendering', () => {
    it('reuses existing blob immediately for carried-forward payslips', async () => {
      mockPrisma.payslip.findMany.mockResolvedValue([
        { id: 'p1', contentHash: 'hash-cf', carriedForward: true },
      ]);
      mockStorage.getByHash.mockResolvedValue({
        id: 'blob-existing',
        contentHash: 'hash-cf',
      });
      mockPrisma.payslipPdf.findMany.mockResolvedValue([]); // no pending left to process

      await service.enqueueAndProcess(['p1']);

      expect(mockStorage.getByHash).toHaveBeenCalledWith('hash-cf', '1.0.0');
      expect(mockPrisma.payslipPdf.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { payslipId: 'p1' },
          create: expect.objectContaining({
            status: PayslipPdfStatus.READY,
            blobId: 'blob-existing',
          }),
        }),
      );
      expect(mockPdfService.generatePayslipPdf).not.toHaveBeenCalled();
    });
  });

  describe('batch status summary', () => {
    it('calculates counts correctly and captures up to 100 failures', async () => {
      mockPrisma.payslip.findMany.mockResolvedValue([
        { id: 'p1', staffId: 'E1', status: PayslipStatus.APPROVED, pdf: { status: PayslipPdfStatus.READY } },
        { id: 'p2', staffId: 'E2', status: PayslipStatus.APPROVED, pdf: { status: PayslipPdfStatus.FAILED, errorMessage: 'Crash', attempts: 2 } },
        { id: 'p3', staffId: 'E3', status: PayslipStatus.APPROVED, pdf: { status: PayslipPdfStatus.EXPIRED } },
        { id: 'p4', staffId: 'E4', status: PayslipStatus.CALCULATED, pdf: null },
      ]);

      const res = await service.getBatchPdfStatus('b1');

      expect(res.total).toBe(4);
      expect(res.approved).toBe(3);
      expect(res.ready).toBe(1);
      expect(res.failed).toBe(1);
      expect(res.expired).toBe(1);
      expect(res.pending).toBe(1);
      expect(res.failures).toHaveLength(1);
      expect(res.failures[0]).toEqual({
        payslipId: 'p2',
        staffId: 'E2',
        errorMessage: 'Crash',
        attempts: 2,
      });
    });
  });
});
