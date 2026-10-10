import { ConflictException, ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { HrOfficerRole } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { payslipError } from './shared/payslip-error-codes';
import { PAYSLIP_AUDIT_ACTOR, payslipAuditMetadata } from './shared/payslip-audit';

export interface PayslipActor {
  id: string;
  role: string;
}

@Injectable()
export class PayslipAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async claim(companyId: string, periodId: string, actor: PayslipActor) {
    if (actor.role === HrOfficerRole.ADMIN) return { administrative: true };

    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, accountingCompanyId: companyId },
    });
    if (!period) {
      throw new NotFoundException('Payroll period does not belong to the accounting company.');
    }

    const existing = await this.prisma.payslipWorkloadClaim.findUnique({
      where: {
        accountingCompanyId_payrollPeriodId: {
          accountingCompanyId: companyId,
          payrollPeriodId: periodId,
        },
      },
    });

    if (existing?.claimedById && existing.claimedById !== actor.id) {
      throw new ConflictException('This payroll workload is already claimed by another HR officer.');
    }

    if (existing?.claimedById === actor.id) {
      return existing;
    }

    // Check if officer already holds a different active claim (D-CLAIM1)
    const existingOtherClaim = await this.prisma.payslipWorkloadClaim.findFirst({
      where: {
        claimedById: actor.id,
        NOT: {
          accountingCompanyId: companyId,
          payrollPeriodId: periodId,
        },
      },
    });

    if (existingOtherClaim) {
      throw payslipError(
        HttpStatus.CONFLICT,
        'OFFICER_ALREADY_HAS_CLAIM',
        'Officer already holds an active claim.',
        {
          companyId: existingOtherClaim.accountingCompanyId,
          periodId: existingOtherClaim.payrollPeriodId,
        },
      );
    }

    try {
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
          claimedById: actor.id,
          claimedAt: new Date(),
        },
        update: {
          claimedById: actor.id,
          claimedAt: new Date(),
          releasedAt: null,
        },
      });

      await this.audit.log({
        actorType: PAYSLIP_AUDIT_ACTOR,
        actorHrOfficerId: actor.id,
        action: 'PAYSLIP_WORKLOAD_CLAIMED',
        entityType: 'PAYSLIP_WORKLOAD_CLAIM',
        entityId: claim.id,
        metadata: payslipAuditMetadata({ companyId, periodId }),
      });

      return claim;
    } catch (err: any) {
      if (
        err?.code === 'P2002' &&
        (err?.meta?.target?.includes('claimedById') ||
          err?.message?.includes('PayslipWorkloadClaim_one_active_per_officer'))
      ) {
        throw payslipError(
          HttpStatus.CONFLICT,
          'OFFICER_ALREADY_HAS_CLAIM',
          'Officer already holds an active claim.',
          { companyId, periodId },
        );
      }
      throw new ConflictException('This payroll workload was claimed concurrently; refresh and try again.');
    }
  }

  async release(companyId: string, periodId: string, actor: PayslipActor) {
    const claim = await this.prisma.payslipWorkloadClaim.findUnique({
      where: {
        accountingCompanyId_payrollPeriodId: {
          accountingCompanyId: companyId,
          payrollPeriodId: periodId,
        },
      },
    });
    if (!claim) throw new NotFoundException('Payroll workload claim not found.');
    if (actor.role !== HrOfficerRole.ADMIN && claim.claimedById !== actor.id) {
      throw new ForbiddenException('Only the owning officer may release this workload.');
    }

    const released = await this.prisma.payslipWorkloadClaim.update({
      where: { id: claim.id },
      data: { claimedById: null, releasedAt: new Date() },
    });

    await this.audit.log({
      actorType: PAYSLIP_AUDIT_ACTOR,
      actorHrOfficerId: actor.id,
      action: 'PAYSLIP_WORKLOAD_RELEASED',
      entityType: 'PAYSLIP_WORKLOAD_CLAIM',
      entityId: claim.id,
      metadata: payslipAuditMetadata({ companyId, periodId }),
    });

    return released;
  }

  async canAccess(companyId: string, periodId: string, actor: PayslipActor): Promise<boolean> {
    if (actor.role === HrOfficerRole.ADMIN) {
      return true;
    }
    const claim = await this.prisma.payslipWorkloadClaim.findUnique({
      where: {
        accountingCompanyId_payrollPeriodId: {
          accountingCompanyId: companyId,
          payrollPeriodId: periodId,
        },
      },
    });
    return claim?.claimedById === actor.id;
  }

  async assertCompanyPeriod(companyId: string, periodId: string, actor: PayslipActor): Promise<void> {
    if (actor.role === HrOfficerRole.ADMIN) return;
    const claim = await this.prisma.payslipWorkloadClaim.findUnique({
      where: {
        accountingCompanyId_payrollPeriodId: {
          accountingCompanyId: companyId,
          payrollPeriodId: periodId,
        },
      },
    });
    if (!claim || claim.claimedById !== actor.id) {
      throw new ForbiddenException('Claim this company payroll workload before accessing it.');
    }
  }

  async assertBatch(batchId: string, actor: PayslipActor) {
    const batch = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
      select: { accountingCompanyId: true, payrollPeriodId: true },
    });
    if (!batch) throw new NotFoundException('Payslip batch not found.');
    await this.assertCompanyPeriod(batch.accountingCompanyId, batch.payrollPeriodId, actor);
    return batch;
  }

  async assertUpload(uploadId: string, actor: PayslipActor) {
    const upload = await this.prisma.billingRateUpload.findUnique({
      where: { id: uploadId },
      select: { accountingCompanyId: true, payrollPeriodId: true },
    });
    if (!upload) throw new NotFoundException('Billing Rate upload not found.');
    await this.assertCompanyPeriod(upload.accountingCompanyId, upload.payrollPeriodId, actor);
    return upload;
  }

  async assertPayslip(payslipId: string, actor: PayslipActor) {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      include: {
        payslipBatch: {
          select: { accountingCompanyId: true, payrollPeriodId: true },
        },
      },
    });
    if (!payslip) throw new NotFoundException('Payslip not found.');
    await this.assertCompanyPeriod(
      payslip.payslipBatch.accountingCompanyId,
      payslip.payslipBatch.payrollPeriodId,
      actor,
    );
    return payslip;
  }
}
