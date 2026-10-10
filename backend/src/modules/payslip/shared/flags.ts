export type FlagSeverity = 'WARN' | 'INFO';

export type PayslipFlagCode =
  | 'NET_NON_POSITIVE'
  | 'DAYS_EXCEED_TOTAL'
  | 'ZERO_DAYS_WORKED'
  | 'OTHER_DEDUCTION_PRESENT'
  | 'LARGE_VARIANCE_VS_PREVIOUS'
  | 'NO_PREVIOUS_PAYSLIP'
  | 'CHANGED_SINCE_REVIEW';

export interface PayslipFlag {
  code: PayslipFlagCode;
  severity: FlagSeverity;
}

export interface CurrentPayslipForFlags {
  netServiceFee: number;
  daysWorked: number;
  totalDays: number;
  otherDeduction: number;
  changedSinceReview?: boolean;
}

export interface PreviousPayslipForFlags {
  netServiceFee: number;
}

export function computePayslipFlags(
  current: CurrentPayslipForFlags,
  previousApproved: PreviousPayslipForFlags | null,
  thresholdPercent: number,
): PayslipFlag[] {
  const flags: PayslipFlag[] = [];

  // NET_NON_POSITIVE: netServiceFee <= 0
  if (current.netServiceFee <= 0) {
    flags.push({ code: 'NET_NON_POSITIVE', severity: 'WARN' });
  }

  // DAYS_EXCEED_TOTAL: daysWorked > totalDays
  if (current.daysWorked > current.totalDays) {
    flags.push({ code: 'DAYS_EXCEED_TOTAL', severity: 'WARN' });
  }

  // ZERO_DAYS_WORKED: daysWorked == 0
  if (current.daysWorked === 0) {
    flags.push({ code: 'ZERO_DAYS_WORKED', severity: 'WARN' });
  }

  // OTHER_DEDUCTION_PRESENT: otherDeduction > 0
  if (current.otherDeduction > 0) {
    flags.push({ code: 'OTHER_DEDUCTION_PRESENT', severity: 'INFO' });
  }

  // CHANGED_SINCE_REVIEW: changedSinceReview === true
  if (current.changedSinceReview) {
    flags.push({ code: 'CHANGED_SINCE_REVIEW', severity: 'WARN' });
  }

  // Previous payslip checks:
  if (!previousApproved) {
    flags.push({ code: 'NO_PREVIOUS_PAYSLIP', severity: 'INFO' });
  } else if (previousApproved.netServiceFee > 0) {
    const prev = previousApproved.netServiceFee;
    const currentNet = current.netServiceFee;
    const varianceRatio = Math.abs(currentNet - prev) / prev;
    const thresholdRatio = thresholdPercent / 100;

    // Exactly at threshold is NOT flagged
    if (varianceRatio > thresholdRatio) {
      flags.push({ code: 'LARGE_VARIANCE_VS_PREVIOUS', severity: 'WARN' });
    }
  }

  return flags;
}
