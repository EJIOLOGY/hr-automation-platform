import * as XLSX from 'xlsx';
import { parseBillingRateWorkbook } from './billing-rate.parser';

function buildOdumWorkbookBuffer(): Buffer {
  const invoiceHeaders = [
    'S/N',
    'STAFF ID',
    'PERSONNEL',
    'BASE FEES',
    'JOB TITLE',
    'ACCOUNTING COMPANY',
    'PAYING COMPANY',
    'DAYS IN THE MONTH',
    'DAYS ABSENT',
    'DAYS WORKED',
    'SERVICE FEES',
    'ABSENT',
    'LOAN / ADVANCE - DEDUCTIONS',
  ];

  const allowanceHeaders = [
    'S/N',
    'STAFF ID',
    'PERSONNEL',
    'BASE FEE',
    'ACCOUNTING COMPANY',
    'PAYING COMPANY',
    'ACCOMMODATION ALLOWANCE',
    'ARREARS ACCOMMODATION ALLOWANCE',
    'TIME OFF TRANSPORT ALLOWANCE',
    'ARREARS TIME OFF TRANSPORT ALLOWANCE',
    'TRANSPORT ALLOWANCE',
    'ARREARS TRANSPORT ALLOWANCE',
    'FEEDING/MISSED MEAL ALLOWANCE',
    'ARREARS FEEDING/MISSED MEAL ALLOWANCE',
    'OUT STATION DUTY ALLOWANCE',
    'ARREARS OUT STATION DUTY ALLOWANCE',
    'HOTEL ACCOMMODATION ALLOWANCE',
    'RECHARGE CARD ALLOWANCE',
    'CERTIFICATE / COURSE REIMBURSEMENT',
    'MOBILIZATION ALLOWANCE',
    'RE-LOCATION ALLOWANCE',
    'PUBLIC HOLIDAY ALLOWANCE',
    'ARREARS PUBLIC HOLIDAY ALLOWANCE',
    'WEEKEND WORK ALLOWANCE',
    'ARREARS WEEKEND WORK ALLOWANCE',
    'HOURLY/WEEKDAY OVERTIME ALLOWANCE',
    'ARREARS HOURLY/WEEKDAY OVERTIME ALLOWANCE',
    'ARREARS SERVICE FEES',
    'PRESENT ON TIME OFF',
    'ARREARS PRESENT ON TIME OFF',
    'FIELD',
    'SHIFT',
    'RIG',
    'JOB BONUS',
    'KRA',
    'HAZARD',
    'HSC BONUS',
    'MARINE',
    'R & M BONUS',
    'LAB BONUS',
    'PERFORMANCE BONUS',
    'END OF CONTRACT BONUS',
    'JOINING BONUS',
    '13TH MONTH BONUS',
    'ANNUAL LEAVE ALLOWANCE',
    'PRODUCTION BONUS',
    'CHRISTMAS BONUS',
    'LEAVE ENCASHMENT ALLOWANCE',
    'NOTICE PAY',
    'MARRIAGE SUPPORT GRANT',
    'LONG SERVICE AWARD',
    'LOYALTY BONUS',
    'TERMINAL BENEFIT',
    'MEDICAL ALLOWANCE',
    'SPECIAL MGT APPROVED BONUS',
    'REIMBURSABLE ALLOWANCES TOTAL',
    'NON-REIMBURSABLE ALLOWANCES TOTAL',
    'TOTAL ALLOWANCE',
    'REMARKS',
  ];

  const inputSheet = XLSX.utils.aoa_to_sheet([
    ['Accounting Company', 'ODUM ENERGY FZE - TRAIN A'],
    ['Paying Company', 'INTERTECH SYSTEMS LIMITED'],
    ['Period', '19-AUGUST-2026 TO 18-SEPTEMBER-2026'],
    ['Month / Year', 'SEPTEMBER / 2026'],
    ['Commission % / VAT %', '2% / 0%'],
  ]);

  // Row 1-3: Report headers
  const invoiceData: unknown[][] = [
    ['COMPANY INVOICE ANALYSIS'],
    ['MONTH OF SEPTEMBER 2026'],
    [''],
    invoiceHeaders,
    // Row 5: Real Employee 1 (Worked Example from Section 7: Uche Emmanuel Chukwuma)
    [
      1,
      '2230355',
      'Uche Emmanuel Chukwuma',
      776160,
      'Mechanical Technician',
      'ODUM ENERGY FZE - TRAIN A',
      'INTERTECH SYSTEMS LIMITED',
      31,
      0,
      31,
      776160,
      0,
      0,
    ],
    // Row 6: Real Employee 2 (With Overtime and Arrears)
    [
      2,
      '1002',
      'Amina Bello',
      500000,
      'Electrical Engineer',
      'ODUM ENERGY FZE - TRAIN A',
      'INTERTECH SYSTEMS LIMITED',
      31,
      0,
      31,
      500000,
      0,
      0,
    ],
  ];

  // Add 10 blank template rows with just S/N populated (simulating rows 81–599)
  for (let s = 3; s <= 12; s += 1) {
    invoiceData.push([s, '', '', '', '', '', '', '', '', '', '', '', '']);
  }
  // Add TOTAL summary row (simulating row 600)
  invoiceData.push([
    'TOTAL',
    '',
    '',
    1276160,
    '',
    '',
    '',
    '',
    '',
    '',
    1276160,
    0,
    0,
  ]);

  const allowanceData: unknown[][] = [
    ['COMPANY ALLOWANCE SPREAD SHEET'],
    ['MONTH OF SEPTEMBER 2026'],
    [''],
    allowanceHeaders,
    // Row 5: Employee 1 (Uche Emmanuel Chukwuma) -> Public holiday: 51,744 (Col V = index 21)
    ((): unknown[] => {
      const row: unknown[] = new Array<unknown>(allowanceHeaders.length).fill(
        null,
      );
      row[0] = 1;
      row[1] = '2230355';
      row[2] = 'Uche Emmanuel Chukwuma';
      row[3] = 776160;
      row[21] = 51744; // PUBLIC HOLIDAY ALLOWANCE
      return row;
    })(),
    // Row 6: Employee 2 (Amina Bello) -> Overtime: 25,000, Arrears Overtime: 15,000, Transport: 20,000, Arrears Transport: 5,000
    ((): unknown[] => {
      const row: unknown[] = new Array<unknown>(allowanceHeaders.length).fill(
        null,
      );
      row[0] = 2;
      row[1] = '1002';
      row[2] = 'Amina Bello';
      row[3] = 500000;
      row[10] = 20000; // TRANSPORT ALLOWANCE
      row[11] = 5000; // ARREARS TRANSPORT ALLOWANCE
      row[25] = 25000; // HOURLY/WEEKDAY OVERTIME ALLOWANCE
      row[26] = 15000; // ARREARS HOURLY/WEEKDAY OVERTIME ALLOWANCE
      return row;
    })(),
  ];

  // Add template rows to allowance matching invoice
  for (let s = 3; s <= 12; s += 1) {
    const row = new Array(allowanceHeaders.length).fill(null);
    row[0] = s;
    allowanceData.push(row);
  }
  // Total summary row for allowance
  allowanceData.push([
    'TOTAL',
    '',
    '',
    '',
    '',
    '',
    null,
    null,
    null,
    null,
    20000,
    5000,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    51744,
    null,
    null,
    null,
    25000,
    15000,
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, inputSheet, 'Input');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(invoiceData),
    'INVOICE SPREAD SHEET',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(allowanceData),
    'ALLOWANCE SPREAD SHEET',
  );
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('parseBillingRateWorkbook', () => {
  it('parses the full 59-column Odum workbook structure and extracts Input metadata', () => {
    const buffer = buildOdumWorkbookBuffer();
    const result = parseBillingRateWorkbook(buffer);

    expect(result.inputMetadata).toBeDefined();
    expect(result.inputMetadata?.accountingCompany).toBe(
      'ODUM ENERGY FZE - TRAIN A',
    );
    expect(result.inputMetadata?.payingCompany).toBe(
      'INTERTECH SYSTEMS LIMITED',
    );
    expect(result.inputMetadata?.month).toBe('SEPTEMBER / 2026');
    expect(result.inputMetadata?.year).toBe(2026);

    // Exactly 2 real employees; the 10 template blank rows and 1 TOTAL summary row are skipped
    expect(result.rows).toHaveLength(2);

    const uche = result.rows[0];
    expect(uche.staffId).toBe('2230355');
    expect(uche.normalizedData.personnel).toBe('Uche Emmanuel Chukwuma');
    expect(uche.normalizedData.baseFee).toBe(776160);
    expect(uche.normalizedData.daysWorked).toBe(31);
    expect(uche.normalizedData.totalDays).toBe(31);
    expect(uche.normalizedData.publicHoliday).toBe(51744);
    expect(uche.validationErrors).toHaveLength(0);

    // Cell coordinates provenance check
    expect(uche.cellCoordinates.publicHoliday).toBe(
      'ALLOWANCE SPREAD SHEET!V5',
    );
    expect(uche.cellCoordinates.baseFee).toBe('INVOICE SPREAD SHEET!D5');
  });

  it('correctly maps companion arrears columns alongside parent allowances', () => {
    const buffer = buildOdumWorkbookBuffer();
    const result = parseBillingRateWorkbook(buffer);

    const amina = result.rows[1];
    expect(amina.staffId).toBe('1002');
    expect(amina.normalizedData.transportAllowance).toBe(20000);
    expect(amina.normalizedData.arrearsTransportAllowance).toBe(5000);
    expect(amina.normalizedData.overtime).toBe(25000);
    expect(amina.normalizedData.arrearsOvertime).toBe(15000);

    // Check cell provenance for arrears
    expect(amina.cellCoordinates.arrearsTransportAllowance).toBe(
      'ALLOWANCE SPREAD SHEET!L6',
    );
    expect(amina.cellCoordinates.arrearsOvertime).toBe(
      'ALLOWANCE SPREAD SHEET!AA6',
    );
  });

  it('handles optional allowances as zero when blank', () => {
    const buffer = buildOdumWorkbookBuffer();
    const result = parseBillingRateWorkbook(buffer);

    const uche = result.rows[0];
    expect(uche.normalizedData.performanceBonus).toBe(0);
    expect(uche.normalizedData.christmasBonus).toBe(0);
    expect(uche.normalizedData.arrearsOvertime).toBe(0);
  });

  it('flags partial entries where some identity fields are populated but others missing', () => {
    const invoiceData: unknown[][] = [
      [
        'S/N',
        'STAFF ID',
        'PERSONNEL',
        'BASE FEES',
        'DAYS IN THE MONTH',
        'DAYS ABSENT',
        'DAYS WORKED',
      ],
      [1, '', 'John Partial', 200000, 30, 0, 30],
    ];
    const allowanceData: unknown[][] = [['PUBLIC HOLIDAY ALLOWANCE'], [0]];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(invoiceData),
      'INVOICE SPREAD SHEET',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(allowanceData),
      'ALLOWANCE SPREAD SHEET',
    );
    const result = parseBillingRateWorkbook(
      XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
    );

    expect(result.rows).toHaveLength(1);
    expect(
      result.rows[0].validationErrors.some((e) => e.field === 'staffId'),
    ).toBe(true);
  });
});
