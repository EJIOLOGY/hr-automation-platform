import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PayslipAuthorizationService } from './payslip-authorization.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HrOfficerRole } from '../../generated/prisma/client';

describe('PayslipAuthorizationService', () => {
  let service: PayslipAuthorizationService;
  let prisma: any;
  let audit: any;

  beforeEach(async () => {
    const prismaMock = {
      payrollPeriod: {
        findFirst: jest.fn(),
      },
      payslipWorkloadClaim: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      payslipBatch: {
        findUnique: jest.fn(),
      },
      billingRateUpload: {
        findUnique: jest.fn(),
      },
      payslip: {
        findUnique: jest.fn(),
      },
    };

    const auditMock = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayslipAuthorizationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<PayslipAuthorizationService>(PayslipAuthorizationService);
    prisma = module.get(PrismaService);
    audit = module.get(AuditService);
  });

  describe('claim', () => {
    it('ADMIN bypass returns administrative: true without checking period or claim', async () => {
      const result = await service.claim('c1', 'p1', { id: 'admin-1', role: HrOfficerRole.ADMIN });
      expect(result).toEqual({ administrative: true });
      expect(prisma.payrollPeriod.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if payroll period does not belong to company', async () => {
      prisma.payrollPeriod.findFirst.mockResolvedValue(null);
      await expect(
        service.claim('c1', 'p1', { id: 'off-1', role: HrOfficerRole.OFFICER }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if claimed by another officer', async () => {
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: 'p1', accountingCompanyId: 'c1' });
      prisma.payslipWorkloadClaim.findUnique.mockResolvedValue({
        id: 'cl-1',
        claimedById: 'off-other',
      });
      await expect(
        service.claim('c1', 'p1', { id: 'off-1', role: HrOfficerRole.OFFICER }),
      ).rejects.toThrow(ConflictException);
    });

    it('returns existing claim idempotently if already claimed by self', async () => {
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: 'p1', accountingCompanyId: 'c1' });
      const existing = { id: 'cl-1', claimedById: 'off-1' };
      prisma.payslipWorkloadClaim.findUnique.mockResolvedValue(existing);

      const result = await service.claim('c1', 'p1', { id: 'off-1', role: HrOfficerRole.OFFICER });
      expect(result).toEqual(existing);
      expect(prisma.payslipWorkloadClaim.upsert).not.toHaveBeenCalled();
    });

    it('throws 409 OFFICER_ALREADY_HAS_CLAIM if officer holds another active claim', async () => {
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: 'p1', accountingCompanyId: 'c1' });
      prisma.payslipWorkloadClaim.findUnique.mockResolvedValue(null);
      prisma.payslipWorkloadClaim.findFirst.mockResolvedValue({
        id: 'cl-old',
        accountingCompanyId: 'c2',
        payrollPeriodId: 'p2',
        claimedById: 'off-1',
      });

      await expect(
        service.claim('c1', 'p1', { id: 'off-1', role: HrOfficerRole.OFFICER }),
      ).rejects.toMatchObject({
        response: {
          code: 'OFFICER_ALREADY_HAS_CLAIM',
          details: { companyId: 'c2', periodId: 'p2' },
        },
      });
    });

    it('handles concurrent claim race and maps unique index violation to OFFICER_ALREADY_HAS_CLAIM', async () => {
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: 'p1', accountingCompanyId: 'c1' });
      prisma.payslipWorkloadClaim.findUnique.mockResolvedValue(null);
      prisma.payslipWorkloadClaim.findFirst.mockResolvedValue(null);
      prisma.payslipWorkloadClaim.upsert.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['claimedById'] },
        message: 'Unique constraint failed on PayslipWorkloadClaim_one_active_per_officer',
      });

      await expect(
        service.claim('c1', 'p1', { id: 'off-1', role: HrOfficerRole.OFFICER }),
      ).rejects.toMatchObject({
        response: {
          code: 'OFFICER_ALREADY_HAS_CLAIM',
        },
      });
    });

    it('creates claim successfully and logs audit', async () => {
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: 'p1', accountingCompanyId: 'c1' });
      prisma.payslipWorkloadClaim.findUnique.mockResolvedValue(null);
      prisma.payslipWorkloadClaim.findFirst.mockResolvedValue(null);
      const createdClaim = { id: 'cl-new', accountingCompanyId: 'c1', payrollPeriodId: 'p1', claimedById: 'off-1' };
      prisma.payslipWorkloadClaim.upsert.mockResolvedValue(createdClaim);

      const res = await service.claim('c1', 'p1', { id: 'off-1', role: HrOfficerRole.OFFICER });
      expect(res).toEqual(createdClaim);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYSLIP_WORKLOAD_CLAIMED',
          actorType: 'HR_OFFICER',
          actorHrOfficerId: 'off-1',
        }),
      );
    });
  });

  describe('release', () => {
    it('throws ForbiddenException if non-admin tries to release another officer claim', async () => {
      prisma.payslipWorkloadClaim.findUnique.mockResolvedValue({
        id: 'cl-1',
        claimedById: 'off-owner',
      });
      await expect(
        service.release('c1', 'p1', { id: 'off-other', role: HrOfficerRole.OFFICER }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows owning officer or ADMIN to release claim', async () => {
      prisma.payslipWorkloadClaim.findUnique.mockResolvedValue({
        id: 'cl-1',
        claimedById: 'off-owner',
      });
      prisma.payslipWorkloadClaim.update.mockResolvedValue({
        id: 'cl-1',
        claimedById: null,
      });

      await service.release('c1', 'p1', { id: 'off-owner', role: HrOfficerRole.OFFICER });
      expect(prisma.payslipWorkloadClaim.update).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYSLIP_WORKLOAD_RELEASED' }),
      );
    });
  });

  describe('canAccess matrix', () => {
    it('returns true for ADMIN unconditionally', async () => {
      const can = await service.canAccess('c1', 'p1', { id: 'a1', role: HrOfficerRole.ADMIN });
      expect(can).toBe(true);
      expect(prisma.payslipWorkloadClaim.findUnique).not.toHaveBeenCalled();
    });

    it('returns true for OFFICER if they hold the claim', async () => {
      prisma.payslipWorkloadClaim.findUnique.mockResolvedValue({ claimedById: 'off-1' });
      const can = await service.canAccess('c1', 'p1', { id: 'off-1', role: HrOfficerRole.OFFICER });
      expect(can).toBe(true);
    });

    it('returns false for OFFICER if claim is unclaimed or belongs to another', async () => {
      prisma.payslipWorkloadClaim.findUnique.mockResolvedValue({ claimedById: 'other' });
      const can = await service.canAccess('c1', 'p1', { id: 'off-1', role: HrOfficerRole.OFFICER });
      expect(can).toBe(false);

      prisma.payslipWorkloadClaim.findUnique.mockResolvedValue(null);
      const canUnclaimed = await service.canAccess('c1', 'p1', { id: 'off-1', role: HrOfficerRole.OFFICER });
      expect(canUnclaimed).toBe(false);
    });
  });
});
