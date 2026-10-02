import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipBatchStatus, PayslipStatus, Prisma } from '../../../generated/prisma/client';

export interface ApprovalActor {
  actorType: string;
  actorHrOfficerId: string;
}

@Injectable()
export class PayslipApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async approveBatch(batchId: string, actor: ApprovalActor): Promise<{ batchId: string; approvedCount: number }> {
    const batch = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    if (batch.status !== PayslipBatchStatus.CALCULATED && batch.status !== PayslipBatchStatus.IN_REVIEW) {
      throw new ConflictException(`Batch is not approvable (current: ${batch.status})`);
    }

    const ineligible = await this.prisma.payslip.count({
      where: { payslipBatchId: batchId, status: { not: PayslipStatus.IN_REVIEW } },
    });
    if (ineligible > 0) {
      throw new ConflictException('Every payslip must be explicitly IN_REVIEW before batch approval.');
    }

    const now = new Date();

    const [, payslipsUpdate] = await this.prisma.$transaction([
      this.prisma.payslipBatch.update({
        where: { id: batchId },
        data: {
          status: PayslipBatchStatus.APPROVED,
          approvedAt: now,
          approvedById: actor.actorHrOfficerId,
        },
      }),
      this.prisma.payslip.updateMany({
        where: { payslipBatchId: batchId },
        data: {
          status: PayslipStatus.APPROVED,
          approvedAt: now,
        },
      }),
    ]);

    await this.audit.log({
      actorType: actor.actorType,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: 'PAYSLIP_BATCH_APPROVED',
      entityType: 'PayslipBatch',
      entityId: batchId,
      metadata: { approvedCount: payslipsUpdate.count },
    });

    return { batchId, approvedCount: payslipsUpdate.count };
  }

  async rejectBatch(batchId: string, reason: string, actor: ApprovalActor): Promise<{ batchId: string }> {
    const batch = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    if (batch.status !== PayslipBatchStatus.CALCULATED && batch.status !== PayslipBatchStatus.IN_REVIEW) {
      throw new ConflictException(`Batch is not rejectable (current: ${batch.status})`);
    }

    await this.prisma.$transaction([
      this.prisma.payslipBatch.update({ where: { id: batchId }, data: { status: PayslipBatchStatus.REJECTED, approvedAt: null } }),
      this.prisma.payslip.updateMany({ where: { payslipBatchId: batchId, status: { not: PayslipStatus.APPROVED } }, data: { status: PayslipStatus.REJECTED } }),
    ]);

    await this.audit.log({
      actorType: actor.actorType,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: 'PAYSLIP_BATCH_REJECTED',
      entityType: 'PayslipBatch',
      entityId: batchId,
      metadata: { reason },
    });

    return { batchId };
  }

  async getPayslip(payslipId: string) {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      include: {
        lines: {
          orderBy: [
            { kind: 'asc' },
            { sortOrder: 'asc' },
          ],
        },
      },
    });

    if (!payslip) {
      throw new NotFoundException(`Payslip ${payslipId} not found`);
    }

    return payslip;
  }

  async listBatches(accountingCompanyId: string, payrollPeriodId?: string) {
    return this.prisma.payslipBatch.findMany({
      where: {
        accountingCompanyId,
        ...(payrollPeriodId ? { payrollPeriodId } : {}),
      },
      include: {
        accountingCompany: true,
        payrollPeriod: true,
        createdBy: {
          select: { fullName: true, email: true },
        },
        _count: {
          select: { payslips: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
