import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, AllowanceClass } from '../src/generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

interface SeedDefinition {
  canonicalName: string;
  sourceSheet: string;
  sourceHeader: string;
  classification: AllowanceClass;
  affectsGrossEarnings: boolean;
  affectsNetServiceFee: boolean;
  supportsArrears: boolean;
  displayLabel: string;
  sortOrder: number;
}

export const SEED_ALLOWANCE_DEFINITIONS: SeedDefinition[] = [
  // Taxable Earnings (in Gross Earnings)
  {
    canonicalName: 'endOfContractBonus',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'END OF CONTRACT BONUS ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'End of Contract Bonus',
    sortOrder: 10,
  },
  {
    canonicalName: 'joiningBonus',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'JOINING BONUS ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Joining Bonus',
    sortOrder: 11,
  },
  {
    canonicalName: 'arrearsServiceFees',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'ARREARS SERVICE FEES',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Arrears Service Fees',
    sortOrder: 12,
  },
  {
    canonicalName: 'leaveEncashment',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'LEAVE ENCASHMENT ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Leave Encashment',
    sortOrder: 13,
  },
  {
    canonicalName: 'overtime',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'HOURLY/WEEKDAY OVERTIME ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: true,
    displayLabel: 'Overtime',
    sortOrder: 14,
  },
  {
    canonicalName: 'rigBonus',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'RIG ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Rig Bonus',
    sortOrder: 15,
  },
  {
    canonicalName: 'jobBonus',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'JOB BONUS ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Job Bonus',
    sortOrder: 16,
  },
  {
    canonicalName: 'weekends',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'WEEKEND WORK ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: true,
    displayLabel: 'Weekends',
    sortOrder: 17,
  },
  {
    canonicalName: 'extraDayWork',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'PRESENT ON TIME OFF',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: true,
    displayLabel: 'Extra Day Work',
    sortOrder: 18,
  },
  {
    canonicalName: 'publicHoliday',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'PUBLIC HOLIDAY ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: true,
    displayLabel: 'Public Holiday',
    sortOrder: 19,
  },
  {
    canonicalName: 'performanceBonus',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'PERFORMANCE BONUS',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Performance Bonus',
    sortOrder: 20,
  },
  {
    canonicalName: 'thirteenthMonth',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: '13TH MONTH BONUS ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
    affectsGrossEarnings: true,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: '13th Month',
    sortOrder: 21,
  },

  // Non-Taxable Allowances (Direct Add to Net Service Fee)
  {
    canonicalName: 'transportAllowance',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'TRANSPORT ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: true,
    displayLabel: 'Transport',
    sortOrder: 30,
  },
  {
    canonicalName: 'accommodationAllowance',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'ACCOMMODATION ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: true,
    displayLabel: 'Accommodation',
    sortOrder: 31,
  },
  {
    canonicalName: 'timeOffTransportAllowance',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'TIME OFF TRANSPORT ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: true,
    displayLabel: 'Time Off Transport',
    sortOrder: 32,
  },
  {
    canonicalName: 'feedingAllowance',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'FEEDING/MISSED MEAL ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: true,
    displayLabel: 'Feeding',
    sortOrder: 33,
  },
  {
    canonicalName: 'outStationAllowance',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'OUT STATION DUTY ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: true,
    displayLabel: 'OutStation',
    sortOrder: 34,
  },
  {
    canonicalName: 'christmasBonus',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'CHRISTMAS BONUS ALLOWANCE',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: false,
    displayLabel: 'Christmas Bonus',
    sortOrder: 35,
  },
  {
    canonicalName: 'marriageSupportGrant',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'MARRIAGE SUPPORT GRANT',
    classification: AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
    affectsGrossEarnings: false,
    affectsNetServiceFee: true,
    supportsArrears: false,
    displayLabel: 'Marriage Support Grant',
    sortOrder: 36,
  },

  // Ignored / Unpaid Allowances (Sections 5 & 2.4)
  {
    canonicalName: 'hotelAccommodation',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'HOTEL ACCOMMODATION ALLOWANCE',
    classification: AllowanceClass.IGNORED,
    affectsGrossEarnings: false,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Hotel Accommodation',
    sortOrder: 50,
  },
  {
    canonicalName: 'rechargeCard',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'RECHARGE CARD ALLOWANCE',
    classification: AllowanceClass.IGNORED,
    affectsGrossEarnings: false,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Recharge Card',
    sortOrder: 51,
  },
  {
    canonicalName: 'courseReimbursement',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'CERTIFICATE / COURSE REIMBURSEMENT',
    classification: AllowanceClass.IGNORED,
    affectsGrossEarnings: false,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Course Reimbursement',
    sortOrder: 52,
  },
  {
    canonicalName: 'mobilizationAllowance',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'MOBILIZATION ALLOWANCE',
    classification: AllowanceClass.IGNORED,
    affectsGrossEarnings: false,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Mobilization Allowance',
    sortOrder: 53,
  },
  {
    canonicalName: 'relocationAllowance',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'RE-LOCATION ALLOWANCE',
    classification: AllowanceClass.IGNORED,
    affectsGrossEarnings: false,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Relocation Allowance',
    sortOrder: 54,
  },
  {
    canonicalName: 'annualLeaveAllowance',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'ANNUAL LEAVE ALLOWANCE',
    classification: AllowanceClass.IGNORED,
    affectsGrossEarnings: false,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Annual Leave Allowance',
    sortOrder: 55,
  },
  {
    canonicalName: 'productionBonus',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'PRODUCTION BONUS',
    classification: AllowanceClass.IGNORED,
    affectsGrossEarnings: false,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Production Bonus',
    sortOrder: 56,
  },
  {
    canonicalName: 'noticePay',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'NOTICE PAY',
    classification: AllowanceClass.IGNORED,
    affectsGrossEarnings: false,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Notice Pay',
    sortOrder: 57,
  },
  {
    canonicalName: 'longServiceAward',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'LONG SERVICE AWARD',
    classification: AllowanceClass.IGNORED,
    affectsGrossEarnings: false,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Long Service Award',
    sortOrder: 58,
  },
  {
    canonicalName: 'loyaltyBonus',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'LOYALTY BONUS',
    classification: AllowanceClass.IGNORED,
    affectsGrossEarnings: false,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Loyalty Bonus',
    sortOrder: 59,
  },
  {
    canonicalName: 'terminalBenefit',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'TERMINAL BENEFIT',
    classification: AllowanceClass.IGNORED,
    affectsGrossEarnings: false,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Terminal Benefit',
    sortOrder: 60,
  },
  {
    canonicalName: 'medicalAllowance',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'MEDICAL ALLOWANCE',
    classification: AllowanceClass.IGNORED,
    affectsGrossEarnings: false,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Medical Allowance',
    sortOrder: 61,
  },
  {
    canonicalName: 'specialMgtApprovedBonus',
    sourceSheet: 'ALLOWANCE SPREAD SHEET',
    sourceHeader: 'SPECIAL MGT APPROVED BONUS',
    classification: AllowanceClass.IGNORED,
    affectsGrossEarnings: false,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Special Mgt Approved Bonus',
    sortOrder: 62,
  },

  // Manual / Under Review (§5, §26)
  {
    canonicalName: 'loanAdvanceDeduction',
    sourceSheet: 'INVOICE SPREAD SHEET',
    sourceHeader: 'LOAN / ADVANCE - DEDUCTIONS',
    classification: AllowanceClass.MANUAL,
    affectsGrossEarnings: false,
    affectsNetServiceFee: false,
    supportsArrears: false,
    displayLabel: 'Loan / Advance - Deductions',
    sortOrder: 99,
  },
];

export async function seedAllowanceDefinitions(): Promise<void> {
  console.log(`Seeding ${SEED_ALLOWANCE_DEFINITIONS.length} allowance definitions...`);

  for (const item of SEED_ALLOWANCE_DEFINITIONS) {
    await prisma.allowanceDefinition.upsert({
      where: { canonicalName: item.canonicalName },
      update: {
        sourceSheet: item.sourceSheet,
        sourceHeader: item.sourceHeader,
        classification: item.classification,
        affectsGrossEarnings: item.affectsGrossEarnings,
        affectsNetServiceFee: item.affectsNetServiceFee,
        supportsArrears: item.supportsArrears,
        displayLabel: item.displayLabel,
        sortOrder: item.sortOrder,
      },
      create: item,
    });
  }

  console.log('Allowance definitions successfully seeded.');
}

if (require.main === module) {
  seedAllowanceDefinitions()
    .catch((err) => {
      console.error('Error seeding allowance definitions:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
