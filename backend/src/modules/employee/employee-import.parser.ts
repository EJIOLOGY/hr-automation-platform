import * as XLSX from 'xlsx';
import type { RawEmployeeRow } from './employee-import.types';

export class EmployeeImportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmployeeImportParseError';
  }
}

/**
 * Maps normalized (trimmed, lowercased) spreadsheet headers to the
 * canonical fields we read. Only fields listed here are ever pulled
 * out of the spreadsheet — columns like NIN, TIN, Bank Name, Account
 * Number, and Home Address are deliberately not aliased anywhere, so
 * they can never reach the Employee table or the WhatsApp-facing
 * system even if present in the source file.
 *
 * Extend the alias arrays (not the canonical field set) if HR's
 * export renames a column.
 */
const HEADER_ALIASES: Record<keyof RawEmployeeRow, string[]> = {
  employeeNumber: ['employee i.d', 'employee id', 'staff id', 'employeenumber'],
  fullName: ['name', 'full name', 'employee name'],
  designation: [
    'current designation',
    'designation',
    'job title',
    'current designation ',
  ],
  phoneNumber: [
    'phone number (whatsapp)',
    'whatsapp number',
    'phone number (whatsapp) ',
  ],
};

function cellToPrimitiveString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return '';
}

function normalizeHeader(header: unknown): string {
  return cellToPrimitiveString(header)
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
}

function buildColumnMap(
  headerRow: unknown[],
): Map<keyof RawEmployeeRow, number> {
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const columnMap = new Map<keyof RawEmployeeRow, number>();

  for (const field of Object.keys(HEADER_ALIASES) as (keyof RawEmployeeRow)[]) {
    const aliases = HEADER_ALIASES[field].map((alias) =>
      alias.trim().toLowerCase(),
    );
    const columnIndex = normalizedHeaders.findIndex((header) =>
      aliases.includes(header.trim()),
    );

    if (columnIndex !== -1) {
      columnMap.set(field, columnIndex);
    }
  }

  return columnMap;
}

function cellToString(value: unknown): string | undefined {
  const text = cellToPrimitiveString(value).trim();
  return text.length > 0 ? text : undefined;
}

export interface ParsedEmployeeSpreadsheet {
  /** Row numbers are 1-based and exclude the header row, matching what HR sees when they open the file. */
  rows: Array<{ row: number; data: RawEmployeeRow }>;
}

export function parseEmployeeSpreadsheet(
  buffer: Buffer,
): ParsedEmployeeSpreadsheet {
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new EmployeeImportParseError(
      'Could not read the file. Upload a valid .xlsx or .csv file.',
    );
  }

  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new EmployeeImportParseError('The spreadsheet has no sheets.');
  }

  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: undefined,
    blankrows: false,
  });

  const [headerRow, ...dataRows] = rows;

  if (!headerRow) {
    throw new EmployeeImportParseError('The spreadsheet is empty.');
  }

  const columnMap = buildColumnMap(headerRow);
  const missingRequired = (['employeeNumber', 'fullName'] as const).filter(
    (field) => !columnMap.has(field),
  );

  if (missingRequired.length > 0) {
    throw new EmployeeImportParseError(
      `Spreadsheet is missing required column(s): ${missingRequired.join(', ')}.`,
    );
  }

  const parsedRows = dataRows.map((row, index) => {
    const data: RawEmployeeRow = {
      employeeNumber: cellToString(row[columnMap.get('employeeNumber')!]),
      fullName: cellToString(row[columnMap.get('fullName')!]),
      designation: columnMap.has('designation')
        ? cellToString(row[columnMap.get('designation')!])
        : undefined,
      phoneNumber: columnMap.has('phoneNumber')
        ? cellToString(row[columnMap.get('phoneNumber')!])
        : undefined,
    };

    // +2: 1 to move from 0-based to 1-based, +1 to account for the header row.
    return { row: index + 2, data };
  });

  return { rows: parsedRows };
}
