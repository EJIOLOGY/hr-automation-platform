import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  BillingRateCanonicalField,
  getHeaderDefinitions,
  normalizedHeader,
} from './billing-rate.mapper';

export interface ParsedBillingRateRow {
  rowNumber: number;
  staffId: string;
  rawData: {
    invoice: Record<string, unknown>;
    allowance: Record<string, unknown>;
  };
  normalizedData: Record<string, unknown>;
  cellCoordinates: Record<string, string>;
  validationErrors: Array<{
    field: string;
    message: string;
    value?: unknown;
  }>;
}

export interface BillingRateInputMetadata {
  accountingCompany?: string;
  payingCompany?: string;
  period?: string;
  month?: string;
  year?: number;
  commissionRate?: number;
  vatRate?: number;
}

export interface ParsedBillingRateWorkbook {
  rows: ParsedBillingRateRow[];
  detectedSheets: string[];
  invoiceHeaderRow: number;
  allowanceHeaderRow: number;
  unmatchedHeaders: string[];
  inputMetadata?: BillingRateInputMetadata | null;
}

type MatrixRow = unknown[];

type HeaderMap = Map<BillingRateCanonicalField, number>;

const INVOICE_SHEET = 'INVOICE SPREAD SHEET';
const ALLOWANCE_SHEET = 'ALLOWANCE SPREAD SHEET';
const INPUT_SHEET = 'Input';
const MAX_HEADER_SCAN_ROWS = 30;

export function columnNumberToName(columnIndex: number): string {
  let temp = columnIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export function parseBillingRateWorkbook(
  buffer: Buffer,
): ParsedBillingRateWorkbook {
  if (!buffer.length)
    throw new BadRequestException('Billing Rate file is empty.');

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellStyles: false,
    });
  } catch {
    throw new BadRequestException(
      'The uploaded file is not a readable Excel workbook.',
    );
  }

  const invoiceSheetName = findSheetName(workbook.SheetNames, INVOICE_SHEET);
  const allowanceSheetName = findSheetName(
    workbook.SheetNames,
    ALLOWANCE_SHEET,
  );

  if (!invoiceSheetName || !allowanceSheetName) {
    throw new BadRequestException(
      `Billing Rate workbook must contain both "${INVOICE_SHEET}" and "${ALLOWANCE_SHEET}" worksheets.`,
    );
  }

  const invoiceMatrix = sheetToMatrix(workbook.Sheets[invoiceSheetName]);
  const allowanceMatrix = sheetToMatrix(workbook.Sheets[allowanceSheetName]);

  const invoice = resolveHeaders(invoiceMatrix, 'invoice');
  const allowance = resolveHeaders(allowanceMatrix, 'allowance');

  const inputSheetName = findSheetName(workbook.SheetNames, INPUT_SHEET);
  const inputMetadata = inputSheetName
    ? parseInputSheet(workbook.Sheets[inputSheetName])
    : null;

  const rowsByStaffId = new Map<string, ParsedBillingRateRow>();

  for (let i = invoice.headerRow + 1; i < invoiceMatrix.length; i += 1) {
    const sourceRow = invoiceMatrix[i] ?? [];
    const staffId = normalizeStaffId(
      getCell(sourceRow, invoice.headers.get('staffId')),
    );
    const personnel = asText(
      getCell(sourceRow, invoice.headers.get('personnel')),
    );
    const baseFeeRaw = getCell(sourceRow, invoice.headers.get('baseFee'));

    // Mandatory 3-field row-validity test (§8.1):
    // A row is template scaffolding if Staff ID, Personnel, and Base Fee are all blank
    const isBlankTemplateRow = !staffId && !personnel && isBlank(baseFeeRaw);
    if (isBlankTemplateRow) continue;

    // Skip summary / TOTAL formula row anywhere in the row (§2.1, §8.1)
    const hasTotal = sourceRow.some((cell) => {
      const txt = asText(cell).toUpperCase();
      return (
        txt === 'TOTAL' || txt.startsWith('TOTAL') || txt.endsWith('TOTAL')
      );
    });
    if (hasTotal) continue;

    if (!staffId) {
      const row = createBaseRow(
        i + 1,
        '',
        invoiceMatrix,
        allowanceMatrix,
        invoice,
        allowance,
        invoiceSheetName,
        allowanceSheetName,
      );
      row.validationErrors.push({
        field: 'staffId',
        message: 'Staff ID is required.',
      });
      rowsByStaffId.set(`__row_${i + 1}`, row);
      continue;
    }

    if (rowsByStaffId.has(staffId)) {
      const duplicateRow = createBaseRow(
        i + 1,
        staffId,
        invoiceMatrix,
        allowanceMatrix,
        invoice,
        allowance,
        invoiceSheetName,
        allowanceSheetName,
      );
      duplicateRow.validationErrors.push({
        field: 'staffId',
        message: `Duplicate Staff ID "${staffId}" in the Billing Rate workbook.`,
        value: staffId,
      });
      rowsByStaffId.set(`__duplicate_${i + 1}`, duplicateRow);
      continue;
    }

    const row = createBaseRow(
      i + 1,
      staffId,
      invoiceMatrix,
      allowanceMatrix,
      invoice,
      allowance,
      invoiceSheetName,
      allowanceSheetName,
    );
    validateRow(row);
    rowsByStaffId.set(staffId, row);
  }

  return {
    rows: [...rowsByStaffId.values()].sort((a, b) => a.rowNumber - b.rowNumber),
    detectedSheets: workbook.SheetNames,
    invoiceHeaderRow: invoice.headerRow + 1,
    allowanceHeaderRow: allowance.headerRow + 1,
    unmatchedHeaders: [
      ...invoice.unmatchedHeaders,
      ...allowance.unmatchedHeaders,
    ],
    inputMetadata,
  };
}

function createBaseRow(
  rowNumber: number,
  staffId: string,
  invoiceMatrix: MatrixRow[],
  allowanceMatrix: MatrixRow[],
  invoice: ResolvedHeaders,
  allowance: ResolvedHeaders,
  invoiceSheetName: string,
  allowanceSheetName: string,
): ParsedBillingRateRow {
  const invoiceRow = invoiceMatrix[rowNumber - 1] ?? [];
  const invoiceDataOffset = rowNumber - 1 - invoice.headerRow;
  const allowanceRowIndex = allowance.headerRow + invoiceDataOffset;
  const allowanceRow = allowanceMatrix[allowanceRowIndex] ?? [];
  const rawInvoice = rowToObject(
    invoiceMatrix[invoice.headerRow] ?? [],
    invoiceRow,
  );
  const rawAllowance = rowToObject(
    allowanceMatrix[allowance.headerRow] ?? [],
    allowanceRow ?? [],
  );

  const normalizedData: Record<string, unknown> = {};
  const cellCoordinates: Record<string, string> = {};
  const validationErrors: ParsedBillingRateRow['validationErrors'] = [];

  for (const definition of getHeaderDefinitions()) {
    const isInvoice = definition.sheet === 'invoice';
    const headers = isInvoice ? invoice.headers : allowance.headers;
    const sourceRow = isInvoice ? invoiceRow : (allowanceRow ?? []);
    const colIndex = headers.get(definition.field);
    const value = getCell(sourceRow, colIndex);

    if (colIndex !== undefined) {
      const sheetName = isInvoice ? invoiceSheetName : allowanceSheetName;
      const targetRowIndex = isInvoice ? rowNumber : allowanceRowIndex + 1;
      cellCoordinates[definition.field] =
        `${sheetName}!${columnNumberToName(colIndex)}${targetRowIndex}`;
    }

    if (definition.numeric) {
      const parsed = parseNumericCell(value);
      normalizedData[definition.field] = parsed.value;
      if (parsed.error) {
        validationErrors.push({
          field: definition.field,
          message: parsed.error,
          value,
        });
      }
    } else {
      normalizedData[definition.field] = asText(value) || null;
    }
  }

  return {
    rowNumber,
    staffId,
    rawData: { invoice: rawInvoice, allowance: rawAllowance },
    normalizedData,
    cellCoordinates,
    validationErrors,
  };
}

interface ResolvedHeaders {
  headerRow: number;
  headers: HeaderMap;
  unmatchedHeaders: string[];
}

function resolveHeaders(
  matrix: MatrixRow[],
  sheet: 'invoice' | 'allowance',
): ResolvedHeaders {
  const definitions = getHeaderDefinitions().filter(
    (item) => item.sheet === sheet,
  );
  let selectedRow = -1;
  let selectedHeaders = new Map<BillingRateCanonicalField, number>();

  for (
    let rowIndex = 0;
    rowIndex < Math.min(matrix.length, MAX_HEADER_SCAN_ROWS);
    rowIndex += 1
  ) {
    const row = matrix[rowIndex] ?? [];
    const headers = new Map<BillingRateCanonicalField, number>();
    const seen = new Set<string>();

    for (let column = 0; column < row.length; column += 1) {
      const header = normalizedHeader(row[column]);
      if (!header) continue;
      if (seen.has(header)) {
        throw new BadRequestException(
          `Duplicate header "${header}" detected in the ${sheet} sheet.`,
        );
      }
      seen.add(header);

      for (const definition of definitions) {
        if (
          definition.aliases.some((alias) => normalizedHeader(alias) === header)
        ) {
          if (headers.has(definition.field)) {
            throw new BadRequestException(
              `Multiple columns resolve to "${definition.field}" in the ${sheet} sheet.`,
            );
          }
          headers.set(definition.field, column);
        }
      }
    }

    const required = definitions.filter((item) => item.required);
    const knownFieldCount = headers.size;
    if (
      required.every((item) => headers.has(item.field)) &&
      (sheet === 'invoice' || knownFieldCount > 0)
    ) {
      selectedRow = rowIndex;
      selectedHeaders = headers;
      break;
    }
  }

  if (selectedRow < 0) {
    const requiredNames = definitions
      .filter((item) => item.required)
      .map((item) => item.aliases[0]);
    throw new BadRequestException(
      `Could not locate the required ${sheet} header row. Required headers: ${requiredNames.join(', ')}.`,
    );
  }

  const selectedSourceHeaders = new Set([...selectedHeaders.values()]);
  const unmatchedHeaders: string[] = [];
  for (
    let column = 0;
    column < (matrix[selectedRow]?.length ?? 0);
    column += 1
  ) {
    const value = normalizedHeader(matrix[selectedRow]?.[column]);
    if (value && !selectedSourceHeaders.has(column))
      unmatchedHeaders.push(value);
  }

  return { headerRow: selectedRow, headers: selectedHeaders, unmatchedHeaders };
}

function parseInputSheet(sheet: XLSX.WorkSheet): BillingRateInputMetadata {
  const matrix = sheetToMatrix(sheet);
  const metadata: BillingRateInputMetadata = {};

  for (let r = 0; r < matrix.length; r += 1) {
    const row = matrix[r] ?? [];
    for (let c = 0; c < row.length; c += 1) {
      const key = normalizedHeader(row[c]);
      const nextVal = row[c + 1];
      if (key.includes('ACCOUNTING COMPANY') && nextVal) {
        metadata.accountingCompany = asText(nextVal);
      } else if (key.includes('PAYING COMPANY') && nextVal) {
        metadata.payingCompany = asText(nextVal);
      } else if (key === 'PERIOD' && nextVal) {
        metadata.period = asText(nextVal);
      } else if (key.includes('MONTH / YEAR') || key.includes('MONTH/YEAR')) {
        const val = asText(nextVal);
        if (val) {
          metadata.month = val;
          const matchYear = val.match(/\b(20\d{2})\b/);
          if (matchYear) metadata.year = parseInt(matchYear[1], 10);
        }
      }
    }
  }

  return metadata;
}

function validateRow(row: ParsedBillingRateRow): void {
  const input = row.normalizedData;
  if (!input.personnel)
    row.validationErrors.push({
      field: 'personnel',
      message: 'Personnel is required for a populated Billing Rate row.',
    });

  const baseFee = input.baseFee as number;
  const totalDays = input.totalDays as number;
  const daysWorked = input.daysWorked as number;
  const daysAbsent = input.daysAbsent as number;

  if (row.staffId && (!Number.isFinite(baseFee) || baseFee <= 0)) {
    row.validationErrors.push({
      field: 'baseFee',
      message: 'Base Fee must be a valid value greater than zero.',
      value: baseFee,
    });
  }
  if (!Number.isFinite(totalDays) || totalDays <= 0) {
    row.validationErrors.push({
      field: 'totalDays',
      message: 'Total Days must be greater than zero.',
      value: totalDays,
    });
  }
  if (!Number.isFinite(daysWorked) || daysWorked < 0) {
    row.validationErrors.push({
      field: 'daysWorked',
      message: 'Days Worked must be zero or greater.',
      value: daysWorked,
    });
  }
  if (Number.isFinite(totalDays) && totalDays > 0 && daysWorked > totalDays) {
    row.validationErrors.push({
      field: 'daysWorked',
      message: 'Days Worked cannot exceed Total Days.',
      value: daysWorked,
    });
  }
  if (!Number.isFinite(daysAbsent) || daysAbsent < 0) {
    row.validationErrors.push({
      field: 'daysAbsent',
      message: 'Days Absent must be zero or greater.',
      value: daysAbsent,
    });
  }

  for (const definition of getHeaderDefinitions().filter(
    (item) => item.sheet === 'allowance',
  )) {
    const value = input[definition.field];
    if (typeof value === 'number' && value < 0) {
      row.validationErrors.push({
        field: definition.field,
        message: 'Allowance values cannot be negative.',
        value,
      });
    }
  }
}

function sheetToMatrix(sheet: XLSX.WorkSheet): MatrixRow[] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true,
  });
}

function rowToObject(
  headers: unknown[],
  row: unknown[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (let i = 0; i < headers.length; i += 1) {
    const rawH = headers[i];
    let header: string;
    if (typeof rawH === 'string') {
      header = rawH.trim();
    } else if (typeof rawH === 'number' || typeof rawH === 'boolean') {
      header = String(rawH).trim();
    } else {
      header = '';
    }
    if (!header) continue;
    result[header] = row[i] ?? null;
  }
  return result;
}

function getCell(
  row: unknown[] | undefined,
  index: number | undefined,
): unknown {
  if (!row || index === undefined) return null;
  return row[index];
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value).trim();
  return '';
}

function normalizeStaffId(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isInteger(value))
    return String(value);
  return asText(value);
}

function parseNumericCell(value: unknown): { value: number; error?: string } {
  if (isBlank(value)) return { value: 0 };
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { value }
      : { value: 0, error: 'Numeric value must be finite.' };
  }
  const cleaned = asText(value).replace(/₦/g, '').replace(/,/g, '');
  if (!cleaned) return { value: 0 };
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return { value: 0, error: `Invalid numeric value "${asText(value)}".` };
  }
  return { value: parsed };
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || asText(value) === '';
}

function findSheetName(
  sheetNames: string[],
  expected: string,
): string | undefined {
  const target = normalizedHeader(expected);
  return sheetNames.find((name) => normalizedHeader(name) === target);
}
