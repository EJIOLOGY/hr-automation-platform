export type BillingRateCanonicalField =
  | 'staffId'
  | 'personnel'
  | 'baseFee'
  | 'totalDays'
  | 'daysAbsent'
  | 'daysWorked'
  | 'endOfContractBonus'
  | 'joiningBonus'
  | 'arrearsServiceFees'
  | 'leaveEncashment'
  | 'overtime'
  | 'rigBonus'
  | 'jobBonus'
  | 'weekends'
  | 'extraDayWork'
  | 'publicHoliday'
  | 'performanceBonus'
  | 'thirteenthMonth'
  | 'transportAllowance'
  | 'accommodationAllowance'
  | 'feedingAllowance'
  | 'outStationAllowance'
  | 'christmasBonus'
  | 'marriageSupportGrant';

export interface HeaderDefinition {
  field: BillingRateCanonicalField;
  aliases: string[];
  required: boolean;
  numeric: boolean;
  sheet: 'invoice' | 'allowance';
}

const normalizeHeader = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[._-]+/g, ' ')
    .trim();

const definitions: HeaderDefinition[] = [
  { field: 'staffId', aliases: ['STAFF ID', 'STAFFID'], required: true, numeric: false, sheet: 'invoice' },
  { field: 'personnel', aliases: ['PERSONNEL'], required: true, numeric: false, sheet: 'invoice' },
  { field: 'baseFee', aliases: ['BASE FEES', 'BASE FEE'], required: true, numeric: true, sheet: 'invoice' },
  { field: 'totalDays', aliases: ['DAYS IN THE MONTH', 'TOTAL NO. OF DAYS', 'TOTAL DAYS'], required: true, numeric: true, sheet: 'invoice' },
  { field: 'daysAbsent', aliases: ['DAYS ABSENT'], required: true, numeric: true, sheet: 'invoice' },
  { field: 'daysWorked', aliases: ['DAYS WORKED', 'NO. OF DAYS WORKED'], required: true, numeric: true, sheet: 'invoice' },

  { field: 'endOfContractBonus', aliases: ['END OF CONTRACT BONUS ALLOWANCE', 'END OF CONTRACT BONUS'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'joiningBonus', aliases: ['JOINING BONUS ALLOWANCE', 'JOINING BONUS'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'arrearsServiceFees', aliases: ['ARREARS SERVICE FEES'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'leaveEncashment', aliases: ['LEAVE ENCASHMENT ALLOWANCE', 'LEAVE ENCASHMENT'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'overtime', aliases: ['HOURLY/WEEKDAY OVERTIME ALLOWANCE', 'OVERTIME WORKED', 'OVERTIME ALLOWANCE'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'rigBonus', aliases: ['RIG ALLOWANCE', 'RIG BONUS'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'jobBonus', aliases: ['JOB BONUS ALLOWANCE', 'JOB BONUS'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'weekends', aliases: ['WEEKEND WORK ALLOWANCE', 'WEEKEND WORK', 'WEEKENDS'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'extraDayWork', aliases: ['PRESENT ON TIME OFF', 'EXTRA DAY WORK'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'publicHoliday', aliases: ['PUBLIC HOLIDAY ALLOWANCE', 'PUBLIC HOLIDAY'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'performanceBonus', aliases: ['PERFORMANCE BONUS'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'thirteenthMonth', aliases: ['13TH MONTH BONUS ALLOWANCE', '13TH MONTH BONUS'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'transportAllowance', aliases: ['TRANSPORT ALLOWANCE'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'accommodationAllowance', aliases: ['ACCOMMODATION ALLOWANCE'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'feedingAllowance', aliases: ['FEEDING/MISSED MEAL ALLOWANCE', 'FEEDING ALLOWANCE', 'MISSED MEAL ALLOWANCE'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'outStationAllowance', aliases: ['OUT STATION DUTY ALLOWANCE', 'OUTSTATION ALLOWANCE', 'OUT STATION ALLOWANCE'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'christmasBonus', aliases: ['CHRISTMAS BONUS ALLOWANCE', 'CHRISTMAS BONUS'], required: false, numeric: true, sheet: 'allowance' },
  { field: 'marriageSupportGrant', aliases: ['MARRIAGE SUPPORT GRANT', 'MARRIAGE SUPPORT GRANT ALLOWANCE'], required: false, numeric: true, sheet: 'allowance' },
];

export const getHeaderDefinitions = (): HeaderDefinition[] => definitions;

export const getDefinition = (field: BillingRateCanonicalField): HeaderDefinition => {
  const definition = definitions.find((item) => item.field === field);
  if (!definition) throw new Error(`Unknown Billing Rate field: ${field}`);
  return definition;
};

export const normalizedHeader = normalizeHeader;
