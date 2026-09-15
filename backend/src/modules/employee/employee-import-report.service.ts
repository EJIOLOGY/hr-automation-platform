import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import type { EmployeeImportReport } from './employee-import.types';

@Injectable()
export class EmployeeImportReportService {
  generateFailedRowsReport(report: EmployeeImportReport): Buffer | null {
    const failedRows = report.results.filter(
      (result) => result.outcome === 'error',
    );

    if (failedRows.length === 0) {
      return null;
    }

    const rows = failedRows.map((result) => ({
      'Spreadsheet Row': result.row,
      'Employee ID': result.employeeNumber ?? '',
      'Full Name': result.fullName ?? '',
      Email: result.email ?? '',
      'Phone Number': result.phoneNumber ?? '',
      'Failure Reason': result.error ?? 'Unknown error',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet['!cols'] = [
      { wch: 18 },
      { wch: 20 },
      { wch: 35 },
      { wch: 40 },
      { wch: 22 },
      { wch: 80 },
    ];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Failed Rows');

    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    });
  }
}
