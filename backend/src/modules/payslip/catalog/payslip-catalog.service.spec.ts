import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayslipCatalogService } from './payslip-catalog.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { HrOfficerRole, HrOfficerStatus } from '../../../generated/prisma/client';

describe('PayslipCatalogService', () => {
  let service: PayslipCatalogService;
  let prisma: any;
  let audit: any;

  beforeEach(async () => {
    const prismaMock = {
      accountingCompany: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      payrollPeriod: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      payslipWorkloadClaim: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      hrOfficer: {
        findUnique: jest.fn(),
      },
    };

    const auditMock = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayslipCatalogService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<PayslipCatalogService>(PayslipCatalogService);
    prisma = module.get(PrismaService);
    audit = module.get(AuditService);
  });

  describe('companies', () => {
    it('listCompanies — returns active companies sorted by name', async () => {
      const companies = [{ id: 'c1', name: 'Alpha Ltd', code: 'ALPHA' }];
      prisma.accountingCompany.findMany.mockResolvedValue(companies);

      const res = await service.listCompanies();
      expect(res).toEqual(companies);
      expect(prisma.accountingCompany.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      });
    });

    it('createCompany — throws 409 COMPANY_EXISTS if duplicate name or code', async () => {
      prisma.accountingCompany.findFirst.mockResolvedValue({ id: 'existing', name: 'Beta Ltd' });
      await expect(
        service.createCompany({ name: 'Beta Ltd', code: 'BETA' }, { id: 'admin-1' }),
      ).rejects.toMatchObject({
        response: { code: 'COMPANY_EXISTS' },
      });
    });

    it('createCompany — creates company and logs audit', async () => {
      prisma.accountingCompany.findFirst.mockResolvedValue(null);
      const created = { id: 'c2', name: 'Gamma Ltd', code: 'GAMMA', isActive: true };
      prisma.accountingCompany.create.mockResolvedValue(created);

      const res = await service.createCompany({ name: 'Gamma Ltd', code: 'GAMMA' }, { id: 'admin-1' });
      expect(res).toEqual(created);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYSLIP_COMPANY_CREATED' }),
      );
    });
  });

  describe('periods', () => {
    it('listPeriods — throws BadRequestException if companyId is missing', async () => {
      await expect(service.listPeriods(undefined)).rejects.toThrow(BadRequestException);
    });

    it('listPeriods — returns periods newest first', async () => {
      const periods = [{ id: 'p1', name: 'Oct 2026' }];
      prisma.payrollPeriod.findMany.mockResolvedValue(periods);

      const res = await service.listPeriods('c1');
      expect(res).toEqual(periods);
      expect(prisma.payrollPeriod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountingCompanyId: 'c1' },
          orderBy: { startDate: 'desc' },
        }),
      );
    });

    it('createPeriod — throws 400 VALIDATION_FAILED if endDate is not after startDate', async () => {
      await expect(
        service.createPeriod(
          {
            accountingCompanyId: 'c1',
            name: 'P1',
            startDate: new Date('2026-10-15'),
            endDate: new Date('2026-10-10'),
          },
          { id: 'admin-1' },
        ),
      ).rejects.toMatchObject({
        response: { code: 'VALIDATION_FAILED' },
      });
    });

    it('createPeriod — throws NotFoundException if company does not exist or is inactive', async () => {
      prisma.accountingCompany.findUnique.mockResolvedValue(null);
      await expect(
        service.createPeriod(
          {
            accountingCompanyId: 'c1',
            name: 'P1',
            startDate: new Date('2026-10-01'),
            endDate: new Date('2026-10-31'),
          },
          { id: 'admin-1' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('createPeriod — throws 409 PERIOD_EXISTS if identical company and date range exists', async () => {
      prisma.accountingCompany.findUnique.mockResolvedValue({ id: 'c1', isActive: true });
      prisma.payrollPeriod.findUnique.mockResolvedValue({ id: 'existing-p' });

      await expect(
        service.createPeriod(
          {
            accountingCompanyId: 'c1',
            name: 'P1',
            startDate: new Date('2026-10-01'),
            endDate: new Date('2026-10-31'),
          },
          { id: 'admin-1' },
        ),
      ).rejects.toMatchObject({
        response: { code: 'PERIOD_EXISTS' },
      });
    });

    it('createPeriod — throws 409 PERIOD_OVERLAP if overlapping period exists for company', async () => {
      prisma.accountingCompany.findUnique.mockResolvedValue({ id: 'c1', isActive: true });
      prisma.payrollPeriod.findUnique.mockResolvedValue(null);
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: 'overlapping-p' });

      await expect(
        service.createPeriod(
          {
            accountingCompanyId: 'c1',
            name: 'P1',
            startDate: new Date('2026-10-01'),
            endDate: new Date('2026-10-31'),
          },
          { id: 'admin-1' },
        ),
      ).rejects.toMatchObject({
        response: { code: 'PERIOD_OVERLAP' },
      });
    });

    it('createPeriod — creates period and logs audit', async () => {
      prisma.accountingCompany.findUnique.mockResolvedValue({ id: 'c1', isActive: true });
      prisma.payrollPeriod.findUnique.mockResolvedValue(null);
      prisma.payrollPeriod.findFirst.mockResolvedValue(null);
      const created = { id: 'p-new', accountingCompanyId: 'c1', name: 'Oct 2026' };
      prisma.payrollPeriod.create.mockResolvedValue(created);

      const res = await service.createPeriod(
        {
          accountingCompanyId: 'c1',
          name: 'Oct 2026',
          startDate: new Date('2026-10-01'),
          endDate: new Date('2026-10-31'),
        },
        { id: 'admin-1' },
      );
      expect(res).toEqual(created);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYSLIP_PERIOD_CREATED' }),
      );
    });
  });

  describe('claims and reassign', () => {
    it('getPeriodClaim — returns claimed metadata if claimed', async () => {
      prisma.payslipWorkloadClaim.findUnique.mockResolvedValue({
        claimedById: 'off-1',
        claimedByName: 'Jane Doe',
        claimedBy: { fullName: 'Jane Doe' },
        claimedAt: new Date('2026-10-01'),
      });

      const res = await service.getPeriodClaim('c1', 'p1', 'off-1');
      expect(res).toEqual({
        claimedById: 'off-1',
        claimedByName: 'Jane Doe',
        claimedAt: expect.any(Date),
        claimedByMe: true,
      });
    });

    it('getPeriodClaim — returns { claimedById: null } if unclaimed', async () => {
      prisma.payslipWorkloadClaim.findUnique.mockResolvedValue(null);
      const res = await service.getPeriodClaim('c1', 'p1', 'off-1');
      expect(res).toEqual({ claimedById: null });
    });

    it('reassignClaim — throws BadRequestException if target officer is inactive or not OFFICER', async () => {
      prisma.hrOfficer.findUnique.mockResolvedValue({ id: 'u1', role: HrOfficerRole.ADMIN, status: HrOfficerStatus.ACTIVE });
      await expect(
        service.reassignClaim('c1', 'p1', { officerId: 'u1' }, { id: 'admin-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('reassignClaim — throws 409 OFFICER_ALREADY_HAS_CLAIM if target officer holds another claim', async () => {
      prisma.hrOfficer.findUnique.mockResolvedValue({ id: 'u2', role: HrOfficerRole.OFFICER, status: HrOfficerStatus.ACTIVE });
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: 'p1', accountingCompanyId: 'c1' });
      prisma.payslipWorkloadClaim.findFirst.mockResolvedValue({
        id: 'cl-other',
        accountingCompanyId: 'c2',
        payrollPeriodId: 'p2',
        claimedById: 'u2',
      });

      await expect(
        service.reassignClaim('c1', 'p1', { officerId: 'u2' }, { id: 'admin-1' }),
      ).rejects.toMatchObject({
        response: {
          code: 'OFFICER_ALREADY_HAS_CLAIM',
          details: { companyId: 'c2', periodId: 'p2' },
        },
      });
    });

    it('reassignClaim — upserts claim and logs audit with previous and new officer', async () => {
      prisma.hrOfficer.findUnique.mockResolvedValue({ id: 'u2', role: HrOfficerRole.OFFICER, status: HrOfficerStatus.ACTIVE });
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: 'p1', accountingCompanyId: 'c1' });
      prisma.payslipWorkloadClaim.findFirst.mockResolvedValue(null);
      prisma.payslipWorkloadClaim.findUnique.mockResolvedValue({ id: 'cl-1', claimedById: 'prev-officer' });
      prisma.payslipWorkloadClaim.upsert.mockResolvedValue({
        id: 'cl-1',
        claimedById: 'u2',
        claimedAt: new Date(),
      });

      const res = await service.reassignClaim('c1', 'p1', { officerId: 'u2' }, { id: 'admin-1' });
      expect(res.claimedById).toBe('u2');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYSLIP_WORKLOAD_REASSIGNED',
          metadata: expect.objectContaining({
            previousOfficerId: 'prev-officer',
            newOfficerId: 'u2',
          }),
        }),
      );
    });

    it('getMyClaims — returns empty array for ADMIN', async () => {
      const res = await service.getMyClaims({ id: 'admin-1', role: HrOfficerRole.ADMIN });
      expect(res).toEqual([]);
      expect(prisma.payslipWorkloadClaim.findMany).not.toHaveBeenCalled();
    });

    it('getMyClaims — returns mapped active claims for OFFICER', async () => {
      prisma.payslipWorkloadClaim.findMany.mockResolvedValue([
        {
          id: 'claim-1',
          accountingCompanyId: 'c1',
          payrollPeriodId: 'p1',
          claimedAt: new Date(),
          accountingCompany: { id: 'c1', name: 'Alpha Ltd', code: 'ALPHA' },
          payrollPeriod: { id: 'p1', name: 'Oct 2026', startDate: new Date('2026-10-01'), endDate: new Date('2026-10-31') },
        },
      ]);

      const res = await service.getMyClaims({ id: 'off-1', role: HrOfficerRole.OFFICER });
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({
        companyId: 'c1',
        companyName: 'Alpha Ltd',
        periodId: 'p1',
        periodName: 'Oct 2026',
      });
    });
  });
});
