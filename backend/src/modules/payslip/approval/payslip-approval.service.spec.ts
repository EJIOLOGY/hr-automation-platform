import { Test, TestingModule } from '@nestjs/testing';
import { PayslipApprovalService } from './payslip-approval.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipBatchStatus, PayslipStatus } from '../../../generated/prisma/client';
import { PAYSLIP_POST_APPROVAL_HOOKS, PayslipPostApprovalHook } from '../shared/post-approval-hook';

describe('PayslipApprovalService', () => {
  let service: PayslipApprovalService;
  let prisma: any;
  let audit: any;
  let hookMock: jest.Mocked<PayslipPostApprovalHook>;

  beforeEach(async () => {
    hookMock = {
      onApproved: jest.fn().mockResolvedValue(undefined),
    };

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
        groupBy: jest.fn(),
      },
      payslipBatchApproval: {
        create: jest.fn().mockResolvedValue({ id: 'appr-1' }),
      },
      $transaction: jest.fn((fn, _opts) => fn(prismaMock)),
    };

    const auditMock = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayslipApprovalService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
        { provide: PAYSLIP_POST_APPROVAL_HOOKS, useValue: [hookMock] },
      ],
    }).compile();

    service = module.get<PayslipApprovalService>(PayslipApprovalService);
    prisma = module.get(PrismaService);
    audit = module.get(AuditService);
  });

  const baseBatch = {
    id: 'batch-1',
    accountingCompanyId: 'comp-1',
    payrollPeriodId: 'period-1',
    version: 3,
    status: PayslipBatchStatus.IN_REVIEW,
  };

  describe('approveBatch', () => {
    it('throws BATCH_NOT_APPROVABLE if batch is already APPROVED', async () => {
      prisma.payslipBatch.findUnique.mockResolvedValue({
        ...baseBatch,
        status: PayslipBatchStatus.APPROVED,
      });

      await expect(
        service.approveBatch('batch-1', { expectedVersion: 3 }, { actorType: 'HR_OFFICER', actorHrOfficerId: 'u1' }),
      ).rejects.toMatchObject({
        response: { code: 'BATCH_NOT_APPROVABLE' },
      });
    });

    it('throws NEWER_VERSION_EXISTS if batch is not the latest version', async () => {
      prisma.payslipBatch.findUnique.mockResolvedValue(baseBatch);
      prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-2', version: 4 });

      await expect(
        service.approveBatch('batch-1', { expectedVersion: 3 }, { actorType: 'HR_OFFICER', actorHrOfficerId: 'u1' }),
      ).rejects.toMatchObject({
        response: { code: 'NEWER_VERSION_EXISTS' },
      });
    });

    it('throws VERSION_MISMATCH if expectedVersion differs from batch.version', async () => {
      prisma.payslipBatch.findUnique.mockResolvedValue(baseBatch);
      prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-1', version: 3 });

      await expect(
        service.approveBatch('batch-1', { expectedVersion: 2 }, { actorType: 'HR_OFFICER', actorHrOfficerId: 'u1' }),
      ).rejects.toMatchObject({
        response: { code: 'VERSION_MISMATCH' },
      });
    });

    it('throws NOTHING_TO_APPROVE if zero IN_REVIEW payslips', async () => {
      prisma.payslipBatch.findUnique.mockResolvedValue(baseBatch);
      prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-1', version: 3 });
      prisma.payslip.groupBy.mockResolvedValue([
        { status: PayslipStatus.CALCULATED, _count: 5 },
      ]);

      await expect(
        service.approveBatch('batch-1', { expectedVersion: 3 }, { actorType: 'HR_OFFICER', actorHrOfficerId: 'u1' }),
      ).rejects.toMatchObject({
        response: { code: 'NOTHING_TO_APPROVE' },
      });
    });

    it('throws 409 UNRESOLVED_PAYSLIPS with employee list if unresolved > 0 without confirmation', async () => {
      prisma.payslipBatch.findUnique.mockResolvedValue(baseBatch);
      prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-1', version: 3 });
      prisma.payslip.groupBy.mockResolvedValue([
        { status: PayslipStatus.IN_REVIEW, _count: 4 },
        { status: PayslipStatus.HELD, _count: 2 },
      ]);
      prisma.payslip.findMany.mockResolvedValue([
        { id: 'p-held-1', staffId: '101', status: PayslipStatus.HELD, employee: { fullName: 'John' } },
        { id: 'p-held-2', staffId: '102', status: PayslipStatus.HELD, employee: { fullName: 'Jane' } },
      ]);

      await expect(
        service.approveBatch('batch-1', { expectedVersion: 3 }, { actorType: 'HR_OFFICER', actorHrOfficerId: 'u1' }),
      ).rejects.toMatchObject({
        response: {
          code: 'UNRESOLVED_PAYSLIPS',
          details: {
            total: 2,
            employees: expect.arrayContaining([
              expect.objectContaining({ staffId: '101', employeeName: 'John', status: 'HELD' }),
            ]),
          },
        },
      });
    });

    it('throws 409 UNRESOLVED_COUNT_CHANGED if confirmation count does not match current unresolved', async () => {
      prisma.payslipBatch.findUnique.mockResolvedValue(baseBatch);
      prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-1', version: 3 });
      prisma.payslip.groupBy.mockResolvedValue([
        { status: PayslipStatus.IN_REVIEW, _count: 4 },
        { status: PayslipStatus.HELD, _count: 2 },
      ]);

      await expect(
        service.approveBatch(
          'batch-1',
          { expectedVersion: 3, confirmUnresolvedCount: 3 }, // expected 2
          { actorType: 'HR_OFFICER', actorHrOfficerId: 'u1' },
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'UNRESOLVED_COUNT_CHANGED',
        },
      });
    });

    it('approves partially when confirmUnresolvedCount matches; batch becomes PARTIALLY_APPROVED', async () => {
      prisma.payslipBatch.findUnique.mockResolvedValue(baseBatch);
      prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-1', version: 3 });
      prisma.payslip.groupBy.mockResolvedValue([
        { status: PayslipStatus.IN_REVIEW, _count: 2 },
        { status: PayslipStatus.HELD, _count: 1 },
      ]);
      prisma.payslip.findMany.mockResolvedValue([
        {
          id: 'p1',
          staffId: '1001',
          calculationInputs: { baseFee: 1000 },
          calculationOutputs: { netServiceFee: 900 },
          lines: [{ name: 'Basic', kind: 'BASE', amount: '1000', taxClass: 'TAXABLE', sortOrder: 0 }],
        },
        {
          id: 'p2',
          staffId: '1002',
          calculationInputs: { baseFee: 2000 },
          calculationOutputs: { netServiceFee: 1800 },
          lines: [{ name: 'Basic', kind: 'BASE', amount: '2000', taxClass: 'TAXABLE', sortOrder: 0 }],
        },
      ]);

      const res = await service.approveBatch(
        'batch-1',
        { expectedVersion: 3, confirmUnresolvedCount: 1, reason: 'Approved confirmed' },
        { actorType: 'HR_OFFICER', actorHrOfficerId: 'u1' },
      );

      expect(res.status).toBe(PayslipBatchStatus.PARTIALLY_APPROVED);
      expect(res.approvedCount).toBe(2);
      expect(prisma.payslipBatchApproval.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            partial: true,
            approvedCount: 2,
            unresolvedCount: 1,
            reason: 'Approved confirmed',
          }),
        }),
      );
      expect(hookMock.onApproved).toHaveBeenCalledWith({
        batchId: 'batch-1',
        payslipIds: ['p1', 'p2'],
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYSLIP_BATCH_PARTIALLY_APPROVED' }),
      );
    });

    it('approves fully when unresolved === 0; batch becomes APPROVED', async () => {
      prisma.payslipBatch.findUnique.mockResolvedValue(baseBatch);
      prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-1', version: 3 });
      prisma.payslip.groupBy.mockResolvedValue([
        { status: PayslipStatus.IN_REVIEW, _count: 3 },
      ]);
      prisma.payslip.findMany.mockResolvedValue([
        {
          id: 'p1',
          staffId: '1001',
          calculationInputs: {},
          calculationOutputs: {},
          lines: [],
        },
      ]);

      const res = await service.approveBatch(
        'batch-1',
        { expectedVersion: 3 },
        { actorType: 'HR_OFFICER', actorHrOfficerId: 'u1' },
      );

      expect(res.status).toBe(PayslipBatchStatus.APPROVED);
      expect(res.approvedCount).toBe(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYSLIP_BATCH_APPROVED' }),
      );
    });

    it('catches and logs hook exceptions without rolling back approval', async () => {
      hookMock.onApproved.mockRejectedValue(new Error('Hook network failure'));
      prisma.payslipBatch.findUnique.mockResolvedValue(baseBatch);
      prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-1', version: 3 });
      prisma.payslip.groupBy.mockResolvedValue([{ status: PayslipStatus.IN_REVIEW, _count: 1 }]);
      prisma.payslip.findMany.mockResolvedValue([
        { id: 'p1', staffId: '1001', calculationInputs: {}, calculationOutputs: {}, lines: [] },
      ]);

      const res = await service.approveBatch(
        'batch-1',
        { expectedVersion: 3 },
        { actorType: 'HR_OFFICER', actorHrOfficerId: 'u1' },
      );

      expect(res.status).toBe(PayslipBatchStatus.APPROVED);
    });
  });

  describe('rejectBatch', () => {
    it('rejects batch and marks non-approved payslips REJECTED', async () => {
      prisma.payslipBatch.findUnique.mockResolvedValue(baseBatch);
      prisma.payslipBatch.findFirst.mockResolvedValue({ id: 'batch-1', version: 3 });

      const res = await service.rejectBatch(
        'batch-1',
        { reason: 'Major calculation discrepancy' },
        { actorType: 'HR_OFFICER', actorHrOfficerId: 'u1' },
      );

      expect(res.batchId).toBe('batch-1');
      expect(prisma.payslipBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PayslipBatchStatus.REJECTED,
            rejectionReason: 'Major calculation discrepancy',
          }),
        }),
      );
      expect(prisma.payslip.updateMany).toHaveBeenCalledWith({
        where: { payslipBatchId: 'batch-1', status: { not: PayslipStatus.APPROVED } },
        data: { status: PayslipStatus.REJECTED },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYSLIP_BATCH_REJECTED' }),
      );
    });
  });
});
