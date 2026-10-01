import { BadRequestException } from '@nestjs/common';
import {
  AllowanceClass,
  PayslipLineKind,
} from '../../../generated/prisma/client';
import {
  CalculationInputs,
  CalculationOutputs,
  PayslipLineDraft,
} from './calculation.types';

export interface AllowanceMetadata {
  canonicalName: string;
  displayLabel: string;
  classification: AllowanceClass;
  affectsGrossEarnings: boolean;
  affectsNetServiceFee: boolean;
  supportsArrears: boolean;
  sortOrder: number;
  parentCanonicalName?: string;
}

export const CANONICAL_ALLOWANCES: Record<string, AllowanceMetadata> = {
  // Taxable allowances
  endOfContractBonus: {
    canonicalName: 'endOfContractBonus',
    displayLabel: 'End of Contract Bonus',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    sortOrder: 10,
  },
  joiningBonus: {
    canonicalName: 'joiningBonus',
    displayLabel: 'Joining Bonus',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    sortOrder: 11,
  },
  arrearsServiceFees: {
    canonicalName: 'arrearsServiceFees',
    displayLabel: 'Arrears Service Fees',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    sortOrder: 12,
  },
  leaveEncashment: {
    canonicalName: 'leaveEncashment',
    displayLabel: 'Leave Encashment',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    sortOrder: 13,
  },
  overtime: {
    canonicalName: 'overtime',
    displayLabel: 'Overtime',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: true,
    sortOrder: 14,
  },
  arrearsOvertime: {
    canonicalName: 'arrearsOvertime',
    displayLabel: 'Arrears - Overtime',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    sortOrder: 14,
    parentCanonicalName: 'overtime',
  },
  rigBonus: {
    canonicalName: 'rigBonus',
    displayLabel: 'Rig Bonus',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    sortOrder: 15,
  },
  jobBonus: {
    canonicalName: 'jobBonus',
    displayLabel: 'Job Bonus',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    sortOrder: 16,
  },
  weekends: {
    canonicalName: 'weekends',
    displayLabel: 'Weekends',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: true,
    sortOrder: 17,
  },
  arrearsWeekend: {
    canonicalName: 'arrearsWeekend',
    displayLabel: 'Arrears - Weekends',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    sortOrder: 17,
    parentCanonicalName: 'weekends',
  },
  extraDayWork: {
    canonicalName: 'extraDayWork',
    displayLabel: 'Extra Day Work',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: true,
    sortOrder: 18,
  },
  arrearsExtraDayWork: {
    canonicalName: 'arrearsExtraDayWork',
    displayLabel: 'Arrears - Extra Day Work',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    sortOrder: 18,
    parentCanonicalName: 'extraDayWork',
  },
  publicHoliday: {
    canonicalName: 'publicHoliday',
    displayLabel: 'Public Holiday',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: true,
    sortOrder: 19,
  },
  arrearsPublicHoliday: {
    canonicalName: 'arrearsPublicHoliday',
    displayLabel: 'Arrears - Public Holiday',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    sortOrder: 19,
    parentCanonicalName: 'publicHoliday',
  },
  performanceBonus: {
    canonicalName: 'performanceBonus',
    displayLabel: 'Performance Bonus',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    sortOrder: 20,
  },
  thirteenthMonth: {
    canonicalName: 'thirteenthMonth',
    displayLabel: '13th Month',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    sortOrder: 21,
  },

  // Non-taxable allowances
  transportAllowance: {
    canonicalName: 'transportAllowance',
    displayLabel: 'Transport',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: true,
    sortOrder: 30,
  },
  arrearsTransportAllowance: {
    canonicalName: 'arrearsTransportAllowance',
    displayLabel: 'Arrears - Transport',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: false,
    sortOrder: 30,
    parentCanonicalName: 'transportAllowance',
  },
  accommodationAllowance: {
    canonicalName: 'accommodationAllowance',
    displayLabel: 'Accommodation',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: true,
    sortOrder: 31,
  },
  arrearsAccommodationAllowance: {
    canonicalName: 'arrearsAccommodationAllowance',
    displayLabel: 'Arrears - Accommodation',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: false,
    sortOrder: 31,
    parentCanonicalName: 'accommodationAllowance',
  },
  timeOffTransportAllowance: {
    canonicalName: 'timeOffTransportAllowance',
    displayLabel: 'Time Off Transport',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: true,
    sortOrder: 32,
  },
  arrearsTimeOffTransportAllowance: {
    canonicalName: 'arrearsTimeOffTransportAllowance',
    displayLabel: 'Arrears - Time Off Transport',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: false,
    sortOrder: 32,
    parentCanonicalName: 'timeOffTransportAllowance',
  },
  feedingAllowance: {
    canonicalName: 'feedingAllowance',
    displayLabel: 'Feeding',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: true,
    sortOrder: 33,
  },
  arrearsFeedingAllowance: {
    canonicalName: 'arrearsFeedingAllowance',
    displayLabel: 'Arrears - Feeding',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: false,
    sortOrder: 33,
    parentCanonicalName: 'feedingAllowance',
  },
  outStationAllowance: {
    canonicalName: 'outStationAllowance',
    displayLabel: 'OutStation',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: true,
    sortOrder: 34,
  },
  arrearsOutStationAllowance: {
    canonicalName: 'arrearsOutStationAllowance',
    displayLabel: 'Arrears - OutStation',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: false,
    sortOrder: 34,
    parentCanonicalName: 'outStationAllowance',
  },
  christmasBonus: {
    canonicalName: 'christmasBonus',
    displayLabel: 'Christmas Bonus',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: false,
    sortOrder: 35,
  },
  marriageSupportGrant: {
    canonicalName: 'marriageSupportGrant',
    displayLabel: 'Marriage Support Grant',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: false,
    sortOrder: 36,
  },
};

export const CALCULATION_ENGINE_VERSION = 'v2.0';

export function roundToCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculatePayslip(
  inputs: CalculationInputs,
  customDefinitions?: Record<string, AllowanceMetadata>,
): CalculationOutputs {
  const definitions = customDefinitions ?? CANONICAL_ALLOWANCES;

  if (!inputs.totalDays || inputs.totalDays <= 0) {
    throw new BadRequestException(
      'Total Days must be greater than zero. Cannot divide by zero.',
    );
  }

  const baseFee = inputs.baseFee ?? 0;
  const daysWorked = inputs.daysWorked ?? 0;
  const totalDays = inputs.totalDays;
  const daysAbsent = inputs.daysAbsent ?? Math.max(0, totalDays - daysWorked);

  // Section 6.1: Consultant Gross Pay = baseFee * (daysWorked / totalDays)
  const consultantGrossPay = roundToCurrency(
    baseFee * (daysWorked / totalDays),
  );

  const lines: PayslipLineDraft[] = [];
  const coords = inputs.cellCoordinates ?? {};

  // Combine allowances and arrears maps
  const allAmounts: Record<string, number> = {
    ...(inputs.allowances ?? {}),
    ...(inputs.arrears ?? {}),
  };

  // Generate dynamic line items
  for (const [key, meta] of Object.entries(definitions)) {
    const rawVal = allAmounts[key];
    if (typeof rawVal !== 'number' || rawVal <= 0) continue;

    const isArrears = Boolean(meta.parentCanonicalName);
    lines.push({
      canonicalName: meta.canonicalName,
      name: meta.displayLabel,
      kind: isArrears ? PayslipLineKind.ARREARS : PayslipLineKind.BASE,
      parentCanonicalName: meta.parentCanonicalName,
      amount: roundToCurrency(rawVal),
      taxClass: meta.classification,
      sortOrder: meta.sortOrder,
      sourceCell: coords[key],
    });
  }

  // Sort lines stably: primary by sortOrder, secondary BASE before ARREARS
  lines.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.kind !== b.kind) return a.kind === PayslipLineKind.BASE ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Section 6.2: Gross Earnings = consultantGrossPay + SUM(Taxable Allowances + Taxable Arrears)
  const taxableEarningsTotal = roundToCurrency(
    lines
      .filter((line) => line.taxClass === AllowanceClass.PAYSLIP_MAPPED_TAXABLE)
      .reduce((sum, line) => sum + line.amount, 0),
  );

  const grossEarnings = roundToCurrency(
    consultantGrossPay + taxableEarningsTotal,
  );

  // Section 6.3: WHT = 0.05 * Gross Earnings
  const wht = roundToCurrency(0.05 * grossEarnings);

  // Section 6.4: Total Deductions = WHT + Other Deductions
  const otherDeduction = roundToCurrency(inputs.otherDeduction ?? 0);
  const totalDeductions = roundToCurrency(wht + otherDeduction);

  // Section 6.5: Net Service Fee = Gross Earnings - Total Deductions + Non-taxable Allowances
  const nonTaxableAllowancesTotal = roundToCurrency(
    lines
      .filter(
        (line) => line.taxClass === AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
      )
      .reduce((sum, line) => sum + line.amount, 0),
  );

  const netServiceFee = roundToCurrency(
    grossEarnings - totalDeductions + nonTaxableAllowancesTotal,
  );

  return {
    baseFee,
    daysWorked,
    totalDays,
    daysAbsent,
    consultantGrossPay,
    taxableEarningsTotal,
    grossEarnings,
    wht,
    otherDeduction,
    totalDeductions,
    nonTaxableAllowancesTotal,
    netServiceFee,
    lines,
    engineVersion: CALCULATION_ENGINE_VERSION,
  };
}
