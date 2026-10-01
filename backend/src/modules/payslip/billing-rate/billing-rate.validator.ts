import { Injectable } from '@nestjs/common';
import type {
  ParsedBillingRateWorkbook,
  ParsedBillingRateRow,
} from './billing-rate.parser';

@Injectable()
export class BillingRateValidator {
  validate(workbook: ParsedBillingRateWorkbook): void {
    const seen = new Set<string>();

    for (const row of workbook.rows) {
      if (!row.staffId) continue;
      if (seen.has(row.staffId)) {
        row.validationErrors.push({
          field: 'staffId',
          message: `Duplicate Staff ID "${row.staffId}".`,
        });
      }
      seen.add(row.staffId);
    }
  }

  summarize(rows: ParsedBillingRateRow[]) {
    return {
      totalRows: rows.length,
      validRows: rows.filter((row) => row.validationErrors.length === 0).length,
      invalidRows: rows.filter((row) => row.validationErrors.length > 0).length,
    };
  }
}
