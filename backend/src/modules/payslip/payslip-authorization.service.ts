import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HrOfficerRole } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface PayslipActor { id: string; role: string; }

@Injectable()
export class PayslipAuthorizationService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async claim(companyId: string, periodId: string, actor: PayslipActor) {
    if (actor.role === HrOfficerRole.ADMIN) return { administrative: true };
    const period = await this.prisma.payrollPeriod.findFirst({ where: { id: periodId, accountingCompanyId: companyId } });
    if (!period) throw new NotFoundException('Payroll period does not belong to the accounting company.');
    const existing = await this.prisma.payslipWorkloadClaim.findUnique({ where: { accountingCompanyId_payrollPeriodId: { accountingCompanyId: companyId, payrollPeriodId: periodId } } });
    if (existing?.claimedById && existing.claimedById !== actor.id) throw new ConflictException('This payroll workload is already claimed by another HR officer.');
    if (existing?.claimedById === actor.id) return existing;
    try {
      const claim = await this.prisma.payslipWorkloadClaim.upsert({
        where: { accountingCompanyId_payrollPeriodId: { accountingCompanyId: companyId, payrollPeriodId: periodId } },
        create: { accountingCompanyId: companyId, payrollPeriodId: periodId, claimedById: actor.id, claimedAt: new Date() },
        update: { claimedById: actor.id, claimedAt: new Date(), releasedAt: null },
      });
      await this.audit.log({ actorType: 'HR_OFFICER', actorHrOfficerId: actor.id, action: 'PAYSLIP_WORKLOAD_CLAIMED', entityType: 'PAYSLIP_WORKLOAD_CLAIM', entityId: claim.id, metadata: { companyId, periodId } });
      return claim;
    } catch {
      throw new ConflictException('This payroll workload was claimed concurrently; refresh and try again.');
    }
  }

  async release(companyId: string, periodId: string, actor: PayslipActor) {
    const claim = await this.prisma.payslipWorkloadClaim.findUnique({ where: { accountingCompanyId_payrollPeriodId: { accountingCompanyId: companyId, payrollPeriodId: periodId } } });
    if (!claim) throw new NotFoundException('Payroll workload claim not found.');
    if (actor.role !== HrOfficerRole.ADMIN && claim.claimedById !== actor.id) throw new ForbiddenException('Only the owning officer may release this workload.');
    const released = await this.prisma.payslipWorkloadClaim.update({ where: { id: claim.id }, data: { claimedById: null, releasedAt: new Date() } });
    await this.audit.log({ actorType: 'HR_OFFICER', actorHrOfficerId: actor.id, action: 'PAYSLIP_WORKLOAD_RELEASED', entityType: 'PAYSLIP_WORKLOAD_CLAIM', entityId: claim.id, metadata: { companyId, periodId } });
    return released;
  }

  async assertCompanyPeriod(companyId: string, periodId: string, actor: PayslipActor): Promise<void> {
    if (actor.role === HrOfficerRole.ADMIN) return;
    const claim = await this.prisma.payslipWorkloadClaim.findUnique({ where: { accountingCompanyId_payrollPeriodId: { accountingCompanyId: companyId, payrollPeriodId: periodId } } });
    if (!claim || claim.claimedById !== actor.id) throw new ForbiddenException('Claim this company payroll workload before accessing it.');
  }

  async assertBatch(batchId: string, actor: PayslipActor) {
    const batch = await this.prisma.payslipBatch.findUnique({ where: { id: batchId }, select: { accountingCompanyId: true, payrollPeriodId: true } });
    if (!batch) throw new NotFoundException('Payslip batch not found.');
    await this.assertCompanyPeriod(batch.accountingCompanyId, batch.payrollPeriodId, actor);
    return batch;
  }

  async assertUpload(uploadId: string, actor: PayslipActor) {
    const upload = await this.prisma.billingRateUpload.findUnique({ where: { id: uploadId }, select: { accountingCompanyId: true, payrollPeriodId: true } });
    if (!upload) throw new NotFoundException('Billing Rate upload not found.');
    await this.assertCompanyPeriod(upload.accountingCompanyId, upload.payrollPeriodId, actor);
    return upload;
  }

  async assertPayslip(payslipId: string, actor: PayslipActor) {
    const payslip = await this.prisma.payslip.findUnique({ where: { id: payslipId }, include: { payslipBatch: { select: { accountingCompanyId: true, payrollPeriodId: true } } } });
    if (!payslip) throw new NotFoundException('Payslip not found.');
    await this.assertCompanyPeriod(payslip.payslipBatch.accountingCompanyId, payslip.payslipBatch.payrollPeriodId, actor);
    return payslip;
  }
}
