import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { PayslipHtmlData } from './payslip.template';
import { PayslipLineKind } from '../../../generated/prisma/client';

@Injectable()
export class PayslipRenderService {
  constructor(private readonly prisma: PrismaService) {}

  async getPayslipData(payslipId: string): Promise<PayslipHtmlData> {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      include: {
        employee: true,
        lines: {
          orderBy: [
            { kind: 'asc' },
            { sortOrder: 'asc' },
          ],
        },
        payslipBatch: {
          include: {
            payrollPeriod: true,
            accountingCompany: true,
          },
        },
      },
    });

    if (!payslip) {
      throw new NotFoundException(`Payslip with ID ${payslipId} not found`);
    }

    return this.mapToHtmlData(payslip);
  }

  async getPayslipDataForBatch(batchId: string): Promise<PayslipHtmlData[]> {
    const payslips = await this.prisma.payslip.findMany({
      where: { payslipBatchId: batchId },
      include: {
        employee: true,
        lines: {
          orderBy: [
            { kind: 'asc' },
            { sortOrder: 'asc' },
          ],
        },
        payslipBatch: {
          include: {
            payrollPeriod: true,
            accountingCompany: true,
          },
        },
      },
    });

    return payslips.map((p) => this.mapToHtmlData(p));
  }

  private mapToHtmlData(payslip: any): PayslipHtmlData {
    const calcInputs = payslip.calculationInputs as Record<string, any> | null;
    const calcOutputs = payslip.calculationOutputs as Record<string, any> | null;

    const companyName = payslip.payslipBatch.accountingCompany.name;
    const payingCompany = typeof calcInputs?.inputMetadata?.payingCompany === 'string' 
      ? calcInputs.inputMetadata.payingCompany 
      : companyName;
    
    const employeeName = payslip.employee?.fullName ?? payslip.staffId;
    const staffId = payslip.staffId;
    const jobTitle = payslip.employee?.jobTitle ?? '';
    const department = payslip.employee?.department ?? '';

    const month = payslip.payslipBatch.payrollPeriod.month ?? 'Unknown';
    const year = payslip.payslipBatch.payrollPeriod.year ?? new Date().getFullYear();

    const daysWorked = typeof calcInputs?.daysWorked === 'number' ? calcInputs.daysWorked : 0;
    const totalDays = typeof calcInputs?.totalDays === 'number' ? calcInputs.totalDays : 0;

    const lines = payslip.lines.map((line: any) => {
      const rawAmount = Number(line.amount);
      const isDeduction = rawAmount < 0;
      return {
        name: line.name,
        kind: line.kind === PayslipLineKind.BASE ? 'BASE' : 'ARREARS',
        taxClass: String(line.taxClass),
        amount: Math.abs(rawAmount),
        isDeduction,
      };
    });

    return {
      companyName,
      payingCompany,
      employeeName,
      staffId,
      jobTitle,
      department,
      month,
      year,
      daysWorked,
      totalDays,
      lines,
      consultantGrossPay: Number(calcOutputs?.consultantGrossPay ?? 0),
      grossEarnings: Number(calcOutputs?.grossEarnings ?? 0),
      wht: Number(calcOutputs?.wht ?? 0),
      otherDeduction: Number(calcOutputs?.otherDeduction ?? 0),
      totalDeductions: Number(calcOutputs?.totalDeductions ?? 0),
      nonTaxableAllowancesTotal: Number(calcOutputs?.nonTaxableAllowancesTotal ?? 0),
      netServiceFee: Number(calcOutputs?.netServiceFee ?? 0),
      engineVersion: typeof calcOutputs?.engineVersion === 'string' ? calcOutputs.engineVersion : '1.0.0',
      generatedAt: new Date().toISOString(),
    };
  }
}
