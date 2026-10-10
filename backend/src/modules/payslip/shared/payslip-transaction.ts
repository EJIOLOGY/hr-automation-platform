import { HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { payslipError } from './payslip-error-codes';

export type PayslipTransactionKind = 'BULK' | 'CALC' | 'ROW';

const logger = new Logger('PayslipTransaction');

export function getTransactionOptions(kind: PayslipTransactionKind): { maxWait: number; timeout: number } {
  const maxWait = Number(process.env.PAYSLIP_TX_MAX_WAIT_MS) || 10000;
  let timeout: number;

  switch (kind) {
    case 'BULK':
      timeout = Number(process.env.PAYSLIP_TX_BULK_TIMEOUT_MS) || 60000;
      break;
    case 'CALC':
      timeout = Number(process.env.PAYSLIP_TX_CALC_TIMEOUT_MS) || 120000;
      break;
    case 'ROW':
      timeout = Number(process.env.PAYSLIP_TX_ROW_TIMEOUT_MS) || 15000;
      break;
  }

  return { maxWait, timeout };
}

export async function runPayslipTransaction<T>(
  prisma: PrismaService,
  kind: PayslipTransactionKind,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const options = getTransactionOptions(kind);
  const startTime = Date.now();

  try {
    return await prisma.$transaction(fn, options);
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    // Prisma P2028 indicates transaction timeout or expired interactive transaction
    if (
      error?.code === 'P2028' ||
      (typeof error?.message === 'string' &&
        (error.message.includes('P2028') ||
          error.message.includes('Transaction already closed') ||
          error.message.includes('Transaction timed out') ||
          error.message.includes('expired transaction')))
    ) {
      logger.error(`Payslip transaction timed out [kind=${kind}, durationMs=${durationMs}]`);
      throw payslipError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'TRANSACTION_TIMEOUT',
        'Database transaction timed out. Safe to retry; no changes were applied.',
        { kind, durationMs },
      );
    }
    throw error;
  }
}
