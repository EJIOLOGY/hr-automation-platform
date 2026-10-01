import * as XLSX from 'xlsx';
import { parseBillingRateWorkbook } from './billing-rate.parser';

function workbookBuffer(): Buffer {
  const invoice = XLSX.utils.aoa_to_sheet([
    ['Report title'],
    ['STAFF ID', 'PERSONNEL', 'BASE FEES', '', '', '', '', 'DAYS IN THE MONTH', 'DAYS ABSENT', 'DAYS WORKED'],
    ['1001', 'Jane Doe', 776160, '', '', '', '', 31, 0, 31],
    ['', '', '', '', '', '', '', '', '', ''],
  ]);
  const allowance = XLSX.utils.aoa_to_sheet([
    ['Allowance report'],
    ['PUBLIC HOLIDAY ALLOWANCE', 'TRANSPORT ALLOWANCE', 'PERFORMANCE BONUS'],
    [51744, 10000, null],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, invoice, 'INVOICE SPREAD SHEET');
  XLSX.utils.book_append_sheet(wb, allowance, 'ALLOWANCE SPREAD SHEET');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('parseBillingRateWorkbook', () => {
  it('detects headers by name and joins allowance data by Staff ID', () => {
    const result = parseBillingRateWorkbook(workbookBuffer());
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].staffId).toBe('1001');
    expect(result.rows[0].normalizedData.baseFee).toBe(776160);
    expect(result.rows[0].normalizedData.publicHoliday).toBe(51744);
    expect(result.rows[0].normalizedData.transportAllowance).toBe(10000);
    expect(result.rows[0].validationErrors).toHaveLength(0);
  });

  it('treats blank optional allowance values as zero', () => {
    const result = parseBillingRateWorkbook(workbookBuffer());
    expect(result.rows[0].normalizedData.performanceBonus).toBe(0);
  });
});
