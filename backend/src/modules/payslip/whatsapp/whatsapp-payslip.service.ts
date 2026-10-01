import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PayslipStatus } from '../../../generated/prisma/client';

export interface PayslipSummaryForWhatsApp {
  payslipId: string;
  month: string;
  year: number;
  netServiceFee: number;
  grossEarnings: number;
  wht: number;
  status: string;
}

@Injectable()
export class WhatsAppPayslipService {
  private readonly logger = new Logger(WhatsAppPayslipService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find the latest approved payslip for an employee by staffId.
   * Returns null if not found or not yet approved.
   */
  async getLatestApprovedPayslip(staffId: string): Promise<PayslipSummaryForWhatsApp | null> {
    const payslip = await this.prisma.payslip.findFirst({
      where: {
        staffId,
        status: PayslipStatus.APPROVED,
      },
      include: {
        payslipBatch: {
          select: {
            payrollPeriod: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!payslip) {
      return null;
    }

    const outputs = payslip.calculationOutputs as any;
    const period = payslip.payslipBatch.payrollPeriod as any;

    return {
      payslipId: payslip.id,
      month: period.month,
      year: period.year,
      netServiceFee: outputs.netServiceFee || 0,
      grossEarnings: outputs.grossEarnings || 0,
      wht: outputs.wht || 0,
      status: payslip.status,
    };
  }

  /**
   * List the last N approved payslips for a staff ID (default 3).
   */
  async listRecentPayslips(staffId: string, limit = 3): Promise<PayslipSummaryForWhatsApp[]> {
    const payslips = await this.prisma.payslip.findMany({
      where: {
        staffId,
        status: PayslipStatus.APPROVED,
      },
      include: {
        payslipBatch: {
          select: {
            payrollPeriod: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return payslips.map((payslip) => {
      const outputs = payslip.calculationOutputs as any;
      const period = payslip.payslipBatch.payrollPeriod as any;

      return {
        payslipId: payslip.id,
        month: period.month,
        year: period.year,
        netServiceFee: outputs.netServiceFee || 0,
        grossEarnings: outputs.grossEarnings || 0,
        wht: outputs.wht || 0,
        status: payslip.status,
      };
    });
  }

  /**
   * Format a payslip summary as a WhatsApp-ready text message.
   */
  formatPayslipMessage(summary: PayslipSummaryForWhatsApp, period: { month: string; year: number }): string {
    const formatCurrency = (n: number) => `₦${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

    return `💰 *Your Payslip - ${period.month} ${period.year}*\n\n` +
           `Consultant Gross Pay: ${formatCurrency(summary.grossEarnings)}\n` +
           `Gross Earnings: ${formatCurrency(summary.grossEarnings)}\n` +
           `WHT (5%): ${formatCurrency(summary.wht)}\n` +
           `*Net Service Fee: ${formatCurrency(summary.netServiceFee)}*\n\n` +
           `Type *1* to download PDF or *0* for main menu.`;
  }
}
