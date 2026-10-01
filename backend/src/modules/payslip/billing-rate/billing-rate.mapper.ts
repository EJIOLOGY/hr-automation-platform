export type BillingRateCanonicalField =
  // Invoice Sheet Fields
  | 'staffId'
  | 'personnel'
  | 'baseFee'
  | 'totalDays'
  | 'daysAbsent'
  | 'daysWorked'
  | 'loanAdvanceDeduction'

  // Taxable Allowance Fields
  | 'endOfContractBonus'
  | 'joiningBonus'
  | 'arrearsServiceFees'
  | 'leaveEncashment'
  | 'overtime'
  | 'arrearsOvertime'
  | 'rigBonus'
  | 'jobBonus'
  | 'weekends'
  | 'arrearsWeekend'
  | 'extraDayWork'
  | 'arrearsExtraDayWork'
  | 'publicHoliday'
  | 'arrearsPublicHoliday'
  | 'performanceBonus'
  | 'thirteenthMonth'

  // Non-taxable Allowance Fields
  | 'transportAllowance'
  | 'arrearsTransportAllowance'
  | 'accommodationAllowance'
  | 'arrearsAccommodationAllowance'
  | 'timeOffTransportAllowance'
  | 'arrearsTimeOffTransportAllowance'
  | 'feedingAllowance'
  | 'arrearsFeedingAllowance'
  | 'outStationAllowance'
  | 'arrearsOutStationAllowance'
  | 'christmasBonus'
  | 'marriageSupportGrant';

export interface HeaderDefinition {
  field: BillingRateCanonicalField;
  aliases: string[];
  required: boolean;
  numeric: boolean;
  sheet: 'invoice' | 'allowance';
  isArrears?: boolean;
  parentField?: BillingRateCanonicalField;
}

const normalizeHeader = (value: unknown): string => {
  let str: string;
  if (value === null || value === undefined) {
    str = '';
  } else if (typeof value === 'string') {
    str = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    str = String(value);
  } else {
    str = '';
  }
  return str
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[._-]+/g, ' ')
    .trim();
};

const definitions: HeaderDefinition[] = [
  // INVOICE SPREAD SHEET
  {
    field: 'staffId',
    aliases: ['STAFF ID', 'STAFFID'],
    required: true,
    numeric: false,
    sheet: 'invoice',
  },
  {
    field: 'personnel',
    aliases: ['PERSONNEL'],
    required: true,
    numeric: false,
    sheet: 'invoice',
  },
  {
    field: 'baseFee',
    aliases: ['BASE FEES', 'BASE FEE'],
    required: true,
    numeric: true,
    sheet: 'invoice',
  },
  {
    field: 'totalDays',
    aliases: [
      'DAYS IN THE MONTH',
      'TOTAL NO. OF DAYS',
      'TOTAL DAYS',
      'DAYS IN MONTH',
    ],
    required: true,
    numeric: true,
    sheet: 'invoice',
  },
  {
    field: 'daysAbsent',
    aliases: ['DAYS ABSENT'],
    required: true,
    numeric: true,
    sheet: 'invoice',
  },
  {
    field: 'daysWorked',
    aliases: ['DAYS WORKED', 'NO. OF DAYS WORKED'],
    required: true,
    numeric: true,
    sheet: 'invoice',
  },
  {
    field: 'loanAdvanceDeduction',
    aliases: [
      'LOAN / ADVANCE - DEDUCTIONS',
      'LOAN / ADVANCE DEDUCTIONS',
      'LOAN ADVANCE DEDUCTIONS',
    ],
    required: false,
    numeric: true,
    sheet: 'invoice',
  },

  // ALLOWANCE SPREAD SHEET - Taxable
  {
    field: 'endOfContractBonus',
    aliases: ['END OF CONTRACT BONUS ALLOWANCE', 'END OF CONTRACT BONUS'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'joiningBonus',
    aliases: ['JOINING BONUS ALLOWANCE', 'JOINING BONUS'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'arrearsServiceFees',
    aliases: ['ARREARS SERVICE FEES'],
    required: false,
    numeric: true,
    sheet: 'allowance',
    isArrears: true,
  },
  {
    field: 'leaveEncashment',
    aliases: ['LEAVE ENCASHMENT ALLOWANCE', 'LEAVE ENCASHMENT'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'overtime',
    aliases: [
      'HOURLY/WEEKDAY OVERTIME ALLOWANCE',
      'OVERTIME WORKED',
      'OVERTIME ALLOWANCE',
    ],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'arrearsOvertime',
    aliases: [
      'ARREARS HOURLY/WEEKDAY OVERTIME ALLOWANCE',
      'ARREARS OVERTIME WORKED',
      'ARREARS OVERTIME ALLOWANCE',
      'ARREARS OVERTIME',
    ],
    required: false,
    numeric: true,
    sheet: 'allowance',
    isArrears: true,
    parentField: 'overtime',
  },
  {
    field: 'rigBonus',
    aliases: ['RIG ALLOWANCE', 'RIG BONUS'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'jobBonus',
    aliases: ['JOB BONUS ALLOWANCE', 'JOB BONUS'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'weekends',
    aliases: ['WEEKEND WORK ALLOWANCE', 'WEEKEND WORK', 'WEEKENDS'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'arrearsWeekend',
    aliases: [
      'ARREARS WEEKEND WORK ALLOWANCE',
      'ARREARS WEEKEND WORK',
      'ARREARS WEEKENDS',
    ],
    required: false,
    numeric: true,
    sheet: 'allowance',
    isArrears: true,
    parentField: 'weekends',
  },
  {
    field: 'extraDayWork',
    aliases: ['PRESENT ON TIME OFF', 'EXTRA DAY WORK'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'arrearsExtraDayWork',
    aliases: ['ARREARS PRESENT ON TIME OFF', 'ARREARS EXTRA DAY WORK'],
    required: false,
    numeric: true,
    sheet: 'allowance',
    isArrears: true,
    parentField: 'extraDayWork',
  },
  {
    field: 'publicHoliday',
    aliases: ['PUBLIC HOLIDAY ALLOWANCE', 'PUBLIC HOLIDAY'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'arrearsPublicHoliday',
    aliases: ['ARREARS PUBLIC HOLIDAY ALLOWANCE', 'ARREARS PUBLIC HOLIDAY'],
    required: false,
    numeric: true,
    sheet: 'allowance',
    isArrears: true,
    parentField: 'publicHoliday',
  },
  {
    field: 'performanceBonus',
    aliases: ['PERFORMANCE BONUS'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'thirteenthMonth',
    aliases: ['13TH MONTH BONUS ALLOWANCE', '13TH MONTH BONUS'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },

  // ALLOWANCE SPREAD SHEET - Non-Taxable
  {
    field: 'transportAllowance',
    aliases: ['TRANSPORT ALLOWANCE'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'arrearsTransportAllowance',
    aliases: ['ARREARS TRANSPORT ALLOWANCE'],
    required: false,
    numeric: true,
    sheet: 'allowance',
    isArrears: true,
    parentField: 'transportAllowance',
  },
  {
    field: 'accommodationAllowance',
    aliases: ['ACCOMMODATION ALLOWANCE'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'arrearsAccommodationAllowance',
    aliases: ['ARREARS ACCOMMODATION ALLOWANCE'],
    required: false,
    numeric: true,
    sheet: 'allowance',
    isArrears: true,
    parentField: 'accommodationAllowance',
  },
  {
    field: 'timeOffTransportAllowance',
    aliases: ['TIME OFF TRANSPORT ALLOWANCE'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'arrearsTimeOffTransportAllowance',
    aliases: ['ARREARS TIME OFF TRANSPORT ALLOWANCE'],
    required: false,
    numeric: true,
    sheet: 'allowance',
    isArrears: true,
    parentField: 'timeOffTransportAllowance',
  },
  {
    field: 'feedingAllowance',
    aliases: [
      'FEEDING/MISSED MEAL ALLOWANCE',
      'FEEDING ALLOWANCE',
      'MISSED MEAL ALLOWANCE',
    ],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'arrearsFeedingAllowance',
    aliases: [
      'ARREARS FEEDING/MISSED MEAL ALLOWANCE',
      'ARREARS FEEDING ALLOWANCE',
      'ARREARS MISSED MEAL ALLOWANCE',
    ],
    required: false,
    numeric: true,
    sheet: 'allowance',
    isArrears: true,
    parentField: 'feedingAllowance',
  },
  {
    field: 'outStationAllowance',
    aliases: [
      'OUT STATION DUTY ALLOWANCE',
      'OUTSTATION ALLOWANCE',
      'OUT STATION ALLOWANCE',
    ],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'arrearsOutStationAllowance',
    aliases: [
      'ARREARS OUT STATION DUTY ALLOWANCE',
      'ARREARS OUTSTATION ALLOWANCE',
      'ARREARS OUT STATION ALLOWANCE',
    ],
    required: false,
    numeric: true,
    sheet: 'allowance',
    isArrears: true,
    parentField: 'outStationAllowance',
  },
  {
    field: 'christmasBonus',
    aliases: ['CHRISTMAS BONUS ALLOWANCE', 'CHRISTMAS BONUS'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
  {
    field: 'marriageSupportGrant',
    aliases: ['MARRIAGE SUPPORT GRANT', 'MARRIAGE SUPPORT GRANT ALLOWANCE'],
    required: false,
    numeric: true,
    sheet: 'allowance',
  },
];

export const getHeaderDefinitions = (): HeaderDefinition[] => definitions;

export const getDefinition = (
  field: BillingRateCanonicalField,
): HeaderDefinition => {
  const definition = definitions.find((item) => item.field === field);
  if (!definition) throw new Error(`Unknown Billing Rate field: ${field}`);
  return definition;
};

export const normalizedHeader = normalizeHeader;
