import type { EmployeeStatus } from '../../generated/prisma/client';

/**
 * Canonical fields we need out of an HR-supplied spreadsheet row, after
 * header aliasing and value normalization. Anything not listed here
 * (NIN, TIN, bank details, home address, etc.) is intentionally never
 * read into this shape — see HEADER_ALIASES in employee-import.parser.ts.
 */
export interface RawEmployeeRow {
  employeeNumber: string | undefined;
  fullName: string | undefined;
  email: string | undefined;
  designation: string | undefined;
  phoneNumber: string | undefined;
}

export interface EmployeeUpsertInput {
  employeeNumber: string;
  fullName: string;
  phoneNumber: string;
  department: string;
  jobTitle: string;
  status: EmployeeStatus;
}

export type ImportRowOutcome = 'created' | 'updated' | 'error';

export interface ImportRowResult {
  row: number;
  outcome: ImportRowOutcome;

  employeeNumber?: string;
  fullName?: string;
  email?: string;
  designation?: string;
  phoneNumber?: string;

  error?: string;

  departmentNeedsReview?: boolean;
}

export interface EmployeeImportReport {
  totalRows: number;
  created: number;
  updated: number;
  failed: number;
  needsDepartmentReview: number;
  results: ImportRowResult[];
}
