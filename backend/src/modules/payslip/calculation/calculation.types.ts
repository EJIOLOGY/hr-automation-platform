import {
  AllowanceClass,
  PayslipLineKind,
} from '../../../generated/prisma/client';

export interface CalculationInputs {
  staffId: string;
  baseFee: number;
  daysWorked: number;
  totalDays: number;
  daysAbsent?: number;
  allowances?: Record<string, number>;
  arrears?: Record<string, number>;
  otherDeduction?: number;
  cellCoordinates?: Record<string, string>;
}

export interface PayslipLineDraft {
  canonicalName: string;
  name: string;
  kind: PayslipLineKind;
  parentCanonicalName?: string;
  amount: number;
  taxClass: AllowanceClass;
  sortOrder: number;
  sourceCell?: string;
}

export interface CalculationOutputs {
  baseFee: number;
  daysWorked: number;
  totalDays: number;
  daysAbsent: number;
  consultantGrossPay: number;
  taxableEarningsTotal: number;
  grossEarnings: number;
  wht: number;
  otherDeduction: number;
  totalDeductions: number;
  nonTaxableAllowancesTotal: number;
  netServiceFee: number;
  lines: PayslipLineDraft[];
  engineVersion: string;
}
