import { BadRequestException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { HrOfficerRole, HrOfficerStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { payslipError } from '../shared/payslip-error-codes';
import { PAYSLIP_AUDIT_ACTOR, payslipAuditMetadata } from '../shared/payslip-audit';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreatePeriodDto } from './dto/create-period.dto';
import { ReassignClaimDto } from './dto/reassign-claim.dto';

@Injectable()
export class PayslipCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listCompanies() {
    return this.prisma.accountingCompany.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCompany(dto: CreateCompanyDto, actor: { id: string }) {
    const existing = await this.prisma.accountingCompany.findFirst({
      where: {
        OR: [
          { name: { equals: dto.name, mode: 'insensitive' } },
          { code: { equals: dto.code, mode: 'insensitive' } },
        ],
      },
    });

    if (existing) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'COMPANY_EXISTS',
        'Company with this name or code already exists.',
      );
    }

    const company = await this.prisma.accountingCompany.create({
      data: {
        name: dto.name,
        code: dto.code,
      },
      select: { id: true, name: true, code: true, isActive: true },
    });

    await this.audit.log({
      actorType: PAYSLIP_AUDIT_ACTOR,
      actorHrOfficerId: actor.id,
      action: 'PAYSLIP_COMPANY_CREATED',
      entityType: 'AccountingCompany',
      entityId: company.id,
      metadata: { companyId: company.id, name: company.name, code: company.code },
    });

    return company;
  }

  async listPeriods(companyId?: string) {
    if (!companyId) {
      throw new BadRequestException('companyId query parameter is required.');
    }

    return this.prisma.payrollPeriod.findMany({
      where: { accountingCompanyId: companyId },
      select: {
        id: true,
        accountingCompanyId: true,
        name: true,
        startDate: true,
        endDate: true,
        month: true,
        year: true,
        status: true,
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async createPeriod(dto: CreatePeriodDto, actor: { id: string }) {
    if (new Date(dto.endDate) <= new Date(dto.startDate)) {
      throw payslipError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'endDate must be after startDate.',
      );
    }

    const company = await this.prisma.accountingCompany.findUnique({
      where: { id: dto.accountingCompanyId },
    });
    if (!company || !company.isActive) {
      throw new NotFoundException('Active accounting company not found.');
    }

    const existingSame = await this.prisma.payrollPeriod.findUnique({
      where: {
        accountingCompanyId_startDate_endDate: {
          accountingCompanyId: dto.accountingCompanyId,
          startDate: dto.startDate,
          endDate: dto.endDate,
        },
      },
    });

    if (existingSame) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'PERIOD_EXISTS',
        'Period already exists for this company and date range.',
      );
    }

    const overlap = await this.prisma.payrollPeriod.findFirst({
      where: {
        accountingCompanyId: dto.accountingCompanyId,
        startDate: { lte: dto.endDate },
        endDate: { gte: dto.startDate },
      },
    });

    if (overlap) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'PERIOD_OVERLAP',
        'Period overlaps with an existing period for this company.',
        { overlappingPeriodId: overlap.id },
      );
    }

    const period = await this.prisma.payrollPeriod.create({
      data: {
        accountingCompanyId: dto.accountingCompanyId,
        name: dto.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
        month: dto.month,
        year: dto.year,
      },
    });

    await this.audit.log({
      actorType: PAYSLIP_AUDIT_ACTOR,
      actorHrOfficerId: actor.id,
      action: 'PAYSLIP_PERIOD_CREATED',
      entityType: 'PayrollPeriod',
      entityId: period.id,
      metadata: payslipAuditMetadata({
        companyId: period.accountingCompanyId,
        periodId: period.id,
      }),
    });

    return period;
  }

  async getPeriodClaim(companyId: string, periodId: string, currentUserId: string) {
    const claim = await this.prisma.payslipWorkloadClaim.findUnique({
      where: {
        accountingCompanyId_payrollPeriodId: {
          accountingCompanyId: companyId,
          payrollPeriodId: periodId,
        },
      },
      include: {
        claimedBy: { select: { fullName: true } },
      },
    });

    if (!claim || !claim.claimedById) {
      return { claimedById: null };
    }

    return {
      claimedById: claim.claimedById,
      claimedByName: claim.claimedBy?.fullName ?? null,
      claimedAt: claim.claimedAt,
      claimedByMe: claim.claimedById === currentUserId,
    };
  }

  async reassignClaim(
    companyId: string,
    periodId: string,
    dto: ReassignClaimDto,
    actor: { id: string },
  ) {
    const officer = await this.prisma.hrOfficer.findUnique({
      where: { id: dto.officerId },
    });

    if (!officer || officer.status !== HrOfficerStatus.ACTIVE || officer.role !== HrOfficerRole.OFFICER) {
      throw new BadRequestException('Target officer must be an active HR officer with role OFFICER.');
    }

    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, accountingCompanyId: companyId },
    });
    if (!period) {
      throw new NotFoundException('Payroll period not found for this accounting company.');
    }

    const existingOther = await this.prisma.payslipWorkloadClaim.findFirst({
      where: {
        claimedById: dto.officerId,
        NOT: {
          accountingCompanyId: companyId,
          payrollPeriodId: periodId,
        },
      },
    });

    if (existingOther) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'OFFICER_ALREADY_HAS_CLAIM',
        'Target officer already holds another active claim.',
        {
          companyId: existingOther.accountingCompanyId,
          periodId: existingOther.payrollPeriodId,
        },
      );
    }

    const currentClaim = await this.prisma.payslipWorkloadClaim.findUnique({
      where: {
        accountingCompanyId_payrollPeriodId: {
          accountingCompanyId: companyId,
          payrollPeriodId: periodId,
        },
      },
    });
    const previousOfficerId = currentClaim?.claimedById ?? null;

    const claim = await this.prisma.payslipWorkloadClaim.upsert({
      where: {
        accountingCompanyId_payrollPeriodId: {
          accountingCompanyId: companyId,
          payrollPeriodId: periodId,
        },
      },
      create: {
        accountingCompanyId: companyId,
        payrollPeriodId: periodId,
        claimedById: dto.officerId,
        claimedAt: new Date(),
      },
      update: {
        claimedById: dto.officerId,
        claimedAt: new Date(),
        releasedAt: null,
      },
    });

    await this.audit.log({
      actorType: PAYSLIP_AUDIT_ACTOR,
      actorHrOfficerId: actor.id,
      action: 'PAYSLIP_WORKLOAD_REASSIGNED',
      entityType: 'PAYSLIP_WORKLOAD_CLAIM',
      entityId: claim.id,
      metadata: payslipAuditMetadata({
        companyId,
        periodId,
        previousOfficerId,
        newOfficerId: dto.officerId,
      }),
    });

    return {
      id: claim.id,
      companyId,
      periodId,
      claimedById: dto.officerId,
      claimedAt: claim.claimedAt,
    };
  }

  async getMyClaims(actor: { id: string; role: string }) {
    if (actor.role === HrOfficerRole.ADMIN) {
      return [];
    }

    const claims = await this.prisma.payslipWorkloadClaim.findMany({
      where: { claimedById: actor.id },
      include: {
        accountingCompany: { select: { id: true, name: true, code: true } },
        payrollPeriod: { select: { id: true, name: true, startDate: true, endDate: true } },
      },
    });

    return claims.map((c) => ({
      id: c.id,
      companyId: c.accountingCompanyId,
      companyName: c.accountingCompany.name,
      companyCode: c.accountingCompany.code,
      periodId: c.payrollPeriodId,
      periodName: c.payrollPeriod.name,
      startDate: c.payrollPeriod.startDate,
      endDate: c.payrollPeriod.endDate,
      claimedAt: c.claimedAt,
    }));
  }
}
