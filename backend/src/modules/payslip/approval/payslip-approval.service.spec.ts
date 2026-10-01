import { Test, TestingModule } from '@nestjs/testing';
import { PayslipApprovalService } from './payslip-approval.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipBatchStatus } from '../../../generated/prisma/client';
import { ConflictException } from '@nestjs/common';

describe('PayslipApprovalService', () => {
  let service: PayslipApprovalService;
  let prisma: any;
  let audit: any;

  beforeEach(async () => {
    const prismaMock = {
      payslipBatch: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payslip: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const auditMock = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayslipApprovalService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<PayslipApprovalService>(PayslipApprovalService);
    prisma = module.get(PrismaService);
    audit = module.get(AuditService);
  });

  it('approveBatch — transitions CALCULATED→APPROVED, returns correct count', async () => {
    const batchId = 'batch-1';
    prisma.payslipBatch.findUnique.mockResolvedValue({ id: batchId, status: PayslipBatchStatus.CALCULATED });
    prisma.$transaction.mockResolvedValue([{ id: batchId }, { count: 5 }]);

    const res = await service.approveBatch(batchId, { actorType: 'HrOfficer', actorHrOfficerId: 'u1' });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(res.approvedCount).toBe(5);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PAYSLIP_BATCH_APPROVED',
      metadata: { approvedCount: 5 }
    }));
  });

  it('approveBatch — throws ConflictException if already APPROVED', async () => {
    const batchId = 'batch-2';
    prisma.payslipBatch.findUnique.mockResolvedValue({ id: batchId, status: PayslipBatchStatus.APPROVED });

    await expect(service.approveBatch(batchId, { actorType: 'HrOfficer', actorHrOfficerId: 'u1' }))
      .rejects.toThrow(ConflictException);
  });

  it('rejectBatch — transitions to DRAFT, logs audit', async () => {
    const batchId = 'batch-3';
    prisma.payslipBatch.findUnique.mockResolvedValue({ id: batchId, status: PayslipBatchStatus.CALCULATED });
    prisma.payslipBatch.update.mockResolvedValue({ id: batchId, status: PayslipBatchStatus.DRAFT });

    await service.rejectBatch(batchId, 'Data error', { actorType: 'HrOfficer', actorHrOfficerId: 'u1' });

    expect(prisma.payslipBatch.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: PayslipBatchStatus.DRAFT, approvedAt: null }
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PAYSLIP_BATCH_REJECTED',
      metadata: { reason: 'Data error' }
    }));
  });
});
