import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { BillingRateUploadStatus, PayslipBatchStatus, PayslipStatus } from '../../../generated/prisma/client';
import { derivePayRunState, PayRunState, PayslipCountsInput } from './pay-run-state';

export interface PayRunStateResponse {
  companyId: string;
  periodId: string;
  state: PayRunState;
  latestBatch: {
    id: string;
    version: number;
    status: PayslipBatchStatus;
  } | null;
  latestUpload: {
    id: string;
    version: number;
    status: BillingRateUploadStatus;
  } | null;
  counts: PayslipCountsInput | null;
}

@Injectable()
export class PayRunService {
  constructor(private readonly prisma: PrismaService) {}

  async getPayRunState(companyId: string, periodId: string): Promise<PayRunStateResponse> {
    // Verify company and period exist
    const [company, period] = await Promise.all([
      this.prisma.accountingCompany.findUnique({ where: { id: companyId }, select: { id: true } }),
      this.prisma.payrollPeriod.findUnique({ where: { id: periodId }, select: { id: true } }),
    ]);

    if (!company) throw new NotFoundException(`Company ${companyId} not found.`);
    if (!period) throw new NotFoundException(`Period ${periodId} not found.`);

    // Latest billing rate upload for this company+period
    const latestUploadRaw = await this.prisma.billingRateUpload.findFirst({
      where: { accountingCompanyId: companyId, payrollPeriodId: periodId },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, status: true },
    });

    // Latest payslip batch for this company+period
    const latestBatchRaw = await this.prisma.payslipBatch.findFirst({
      where: { accountingCompanyId: companyId, payrollPeriodId: periodId },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, status: true },
    });

    let earlierVersionHasApprovedPayslips = false;
    let countsInput: PayslipCountsInput | null = null;

    if (latestBatchRaw) {
      // Check if any earlier version batch has APPROVED payslips
      if (latestBatchRaw.version > 1) {
        const approvedInEarlier = await this.prisma.payslip.count({
          where: {
            payslipBatch: {
              accountingCompanyId: companyId,
              payrollPeriodId: periodId,
              version: { lt: latestBatchRaw.version },
            },
            status: PayslipStatus.APPROVED,
          },
        });
        earlierVersionHasApprovedPayslips = approvedInEarlier > 0;
      }

      // Count payslips by status in latest batch
      const countsRaw = await this.prisma.payslip.groupBy({
        by: ['status'],
        where: { payslipBatchId: latestBatchRaw.id },
        _count: true,
      });

      const zero: PayslipCountsInput = { total: 0, CALCULATED: 0, IN_REVIEW: 0, HELD: 0, REJECTED: 0, APPROVED: 0 };
      for (const row of countsRaw) {
        const st = row.status as keyof Omit<PayslipCountsInput, 'total'>;
        if (st in zero) {
          zero[st] = row._count;
          zero.total += row._count;
        }
      }
      countsInput = zero;
    }

    const latestUpload = latestUploadRaw
      ? { id: latestUploadRaw.id, version: latestUploadRaw.version, status: latestUploadRaw.status }
      : null;

    const latestBatch = latestBatchRaw
      ? { id: latestBatchRaw.id, version: latestBatchRaw.version, status: latestBatchRaw.status, earlierVersionHasApprovedPayslips }
      : null;

    const state = derivePayRunState({ latestUpload, latestBatch, counts: countsInput });

    return {
      companyId,
      periodId,
      state,
      latestBatch: latestBatch ? { id: latestBatch.id, version: latestBatch.version, status: latestBatch.status } : null,
      latestUpload,
      counts: countsInput,
    };
  }
}
