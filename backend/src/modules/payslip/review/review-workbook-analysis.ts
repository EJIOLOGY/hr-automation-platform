import { BadRequestException, HttpStatus } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { PayslipStatus } from '../../../generated/prisma/client';
import type { AllowanceMetadata } from '../calculation/calculation-engine';
import { calculatePayslip } from '../calculation/calculation-engine';
import type {
  CalculationInputs,
  CalculationOutputs,
} from '../calculation/calculation.types';
import { payslipError } from '../shared/payslip-error-codes';
import { REVIEW_WORKBOOK_META_SHEET } from './review-workbook.service';

/**
 * Parsing and validation of an uploaded HR review workbook. Pure: no database access and no writes, so the same
 * logic serves the preview (report) and the apply (recompute from the stored plan).
 *
 * The workbook has ONE layout, the one `exportReviewWorkbook` writes. Columns are found by header name, not by
 * position, and a file that does not carry the export's headers and hidden meta sheet is rejected as a whole.
 */

export const PAYSLIPS_SHEET = 'Payslips';
export const LINE_ITEMS_SHEET = 'LineItems';
export const MAX_PAYSLIP_ROWS = 1500;
const MAX_LINE_ROWS = 30000;

export type DecisionKind = 'REVIEWED' | 'HOLD' | 'REJECT' | 'RESET';
export type RowStatus =
  'CHANGED' | 'UNCHANGED' | 'DECISION_ONLY' | 'IGNORED' | 'INVALID';

const INPUT_FIELDS = [
  'daysWorked',
  'totalDays',
  'daysAbsent',
  'baseFee',
  'otherDeduction',
] as const;
export type InputField = (typeof INPUT_FIELDS)[number];
export type InputOverrides = Partial<Record<InputField, number>>;

const FIELD_HEADERS: Record<InputField, string> = {
  daysWorked: 'DaysWorked',
  totalDays: 'TotalDays',
  daysAbsent: 'DaysAbsent',
  baseFee: 'BaseFee',
  otherDeduction: 'OtherDeduction',
};

const REQUIRED_PAYSLIP_HEADERS = [
  'PayslipID',
  'StaffID',
  ...Object.values(FIELD_HEADERS),
  'ReviewNotes',
  'HRDecision',
];
const REQUIRED_LINE_HEADERS = ['StaffID', 'LineName', 'Amount'];

export interface WorkbookMeta {
  batchId: string;
  batchVersion: number;
  exportHash: string;
  batchStateHash: string;
  exportedAt: string;
}

export interface WorkbookError {
  row: number;
  staffId?: string;
  field?: string;
  code: string;
  message: string;
}

export interface PayslipForAnalysis {
  id: string;
  staffId: string;
  status: PayslipStatus;
  calculationInputs: unknown;
  calculationOutputs: unknown;
}

export interface PlannedEdit {
  payslipId: string;
  staffId: string;
  overrides: InputOverrides;
  allowances: Record<string, number>;
  arrears: Record<string, number>;
}

export interface PlannedDecision {
  payslipId: string;
  staffId: string;
  decision: DecisionKind;
  note?: string;
}

export interface RowChange {
  field: string;
  previous: number;
  next: number;
}

export interface AnalysedRow {
  payslipId: string;
  staffId: string;
  status: RowStatus;
  decision: DecisionKind | null;
  note?: string;
  changes: RowChange[];
  netServiceFeeBefore?: string;
  netServiceFeeAfter?: string;
}

export interface WorkbookSummary {
  changed: number;
  unchanged: number;
  ignored: number;
  decisionOnly: number;
  invalid: number;
  affectsApproved: number;
  willCreateCorrectionVersion: boolean;
  netServiceFeeDelta: string;
}

export interface WorkbookAnalysis {
  errors: WorkbookError[];
  rows: AnalysedRow[];
  edits: PlannedEdit[];
  decisions: PlannedDecision[];
  summary: WorkbookSummary;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;
const sameNumber = (a: number, b: number): boolean => Math.abs(a - b) < 0.005;
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function cellText(val: ExcelJS.CellValue | undefined): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean')
    return String(val).trim();
  if (val instanceof Date) return '';
  if (typeof val === 'object') {
    const v = val as {
      text?: unknown;
      result?: unknown;
      richText?: Array<{ text: string }>;
    };
    if (Array.isArray(v.richText))
      return v.richText
        .map((r) => r.text)
        .join('')
        .trim();
    if (v.result !== undefined && v.result !== null)
      return String(v.result as string | number | boolean).trim();
    if (v.text !== undefined && v.text !== null)
      return String(v.text as string).trim();
  }
  return '';
}

function headerIndex(ws: ExcelJS.Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const key = norm(cellText(cell.value));
    if (key && !map.has(key)) map.set(key, col);
  });
  return map;
}

function mapDecision(raw: string): DecisionKind | null {
  switch (raw.trim().toUpperCase()) {
    case 'APPROVE':
    case 'REVIEWED':
      return 'REVIEWED';
    case 'HOLD':
      return 'HOLD';
    case 'REJECT':
      return 'REJECT';
    case 'RESET':
      return 'RESET';
    default:
      return null;
  }
}

/** Parses a numeric cell. Returns undefined for a blank cell (= no change) or an error code. */
function parseAmount(text: string): {
  value?: number;
  error?: 'INVALID_NUMBER' | 'NEGATIVE_NUMBER';
} {
  if (text === '') return {};
  if (!/^-?\d+(\.\d+)?$/.test(text.replace(/,/g, '')))
    return { error: 'INVALID_NUMBER' };
  const n = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(n)) return { error: 'INVALID_NUMBER' };
  if (n < 0) return { error: 'NEGATIVE_NUMBER' };
  return { value: round2(n) };
}

function inputsOf(payslip: PayslipForAnalysis): CalculationInputs {
  return (payslip.calculationInputs ?? {}) as CalculationInputs;
}

function outputsOf(payslip: PayslipForAnalysis): Partial<CalculationOutputs> {
  return payslip.calculationOutputs ?? {};
}

/** The value the export wrote for this field (DaysAbsent is the effective, calculated value). */
function currentFieldValue(
  payslip: PayslipForAnalysis,
  field: InputField,
): number {
  const inputs = inputsOf(payslip);
  if (field === 'daysAbsent')
    return Number(outputsOf(payslip).daysAbsent ?? inputs.daysAbsent ?? 0);
  return Number((inputs as unknown as Record<string, unknown>)[field] ?? 0);
}

function currentAllowanceValue(
  payslip: PayslipForAnalysis,
  canonicalName: string,
): number {
  const inputs = inputsOf(payslip);
  return Number(
    { ...(inputs.allowances ?? {}), ...(inputs.arrears ?? {}) }[
      canonicalName
    ] ?? 0,
  );
}

/** Merges a planned edit into a payslip's stored inputs. Used for both the preview and the apply. */
export function applyEditToInputs(
  current: CalculationInputs,
  edit: PlannedEdit,
): CalculationInputs {
  return {
    ...current,
    ...edit.overrides,
    allowances: { ...(current.allowances ?? {}), ...edit.allowances },
    arrears: { ...(current.arrears ?? {}), ...edit.arrears },
  };
}

// ─── Workbook loading and meta ───────────────────────────────────────────────

export async function loadReviewWorkbook(
  buffer: Buffer,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw payslipError(
      HttpStatus.BAD_REQUEST,
      'INVALID_WORKBOOK_FILE',
      'The file could not be read as an .xlsx workbook.',
    );
  }
  return wb;
}

export function readWorkbookMeta(wb: ExcelJS.Workbook): WorkbookMeta {
  const ws = wb.getWorksheet(REVIEW_WORKBOOK_META_SHEET);
  const invalid = (message: string) =>
    payslipError(HttpStatus.BAD_REQUEST, 'WORKBOOK_META_INVALID', message);
  if (!ws) {
    throw invalid(
      'This file is not a review workbook exported by the system (hidden meta sheet is missing). Export a fresh workbook for this batch.',
    );
  }
  const values = new Map<string, string>();
  ws.eachRow((row) => {
    const key = cellText(row.getCell(1).value);
    if (key) values.set(key, cellText(row.getCell(2).value));
  });
  const batchVersion = Number(values.get('batchVersion'));
  const meta: WorkbookMeta = {
    batchId: values.get('batchId') ?? '',
    batchVersion,
    exportHash: values.get('exportHash') ?? '',
    batchStateHash: values.get('batchStateHash') ?? '',
    exportedAt: values.get('exportedAt') ?? '',
  };
  if (
    !meta.batchId ||
    !meta.exportHash ||
    !meta.batchStateHash ||
    !Number.isInteger(batchVersion) ||
    batchVersion < 1
  ) {
    throw invalid(
      'The hidden meta sheet of this workbook is incomplete or has been altered. Export a fresh workbook.',
    );
  }
  return meta;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

interface LineEdit {
  allowances: Record<string, number>;
  arrears: Record<string, number>;
  changes: RowChange[];
}

/**
 * Validates every row of the uploaded workbook against the batch and works out, per payslip, what changed and what
 * the recalculated figures would be. ALL problems are collected so HR can fix them in one pass.
 */
export function analyseReviewWorkbook(args: {
  workbook: ExcelJS.Workbook;
  payslips: PayslipForAnalysis[];
  definitions: Record<string, AllowanceMetadata>;
}): WorkbookAnalysis {
  const { workbook, payslips, definitions } = args;
  const errors: WorkbookError[] = [];
  const byStaff = new Map(payslips.map((p) => [p.staffId, p]));

  const ws = workbook.getWorksheet(PAYSLIPS_SHEET);
  if (!ws) {
    throw payslipError(
      HttpStatus.BAD_REQUEST,
      'WORKBOOK_PARSE_ERRORS',
      `The "${PAYSLIPS_SHEET}" sheet is missing.`,
      {
        errors: [
          {
            row: 1,
            code: 'MISSING_SHEET',
            message: `The "${PAYSLIPS_SHEET}" sheet is missing.`,
          },
        ],
      },
    );
  }
  if (ws.actualRowCount - 1 > MAX_PAYSLIP_ROWS) {
    throw payslipError(
      HttpStatus.BAD_REQUEST,
      'TOO_MANY_ROWS',
      `The workbook has more than ${MAX_PAYSLIP_ROWS} payslip rows.`,
    );
  }

  // Headers: one layout only. A legacy layout (no PayslipID column) or a damaged header row is refused outright.
  const headers = headerIndex(ws);
  const missing = REQUIRED_PAYSLIP_HEADERS.filter((h) => !headers.has(norm(h)));
  if (missing.length > 0) {
    throw payslipError(
      HttpStatus.BAD_REQUEST,
      'WORKBOOK_PARSE_ERRORS',
      'The "Payslips" sheet does not use the current review workbook layout. Export a fresh workbook and re-apply your changes.',
      {
        errors: missing.map((h) => ({
          row: 1,
          field: h,
          code: 'MISSING_COLUMN',
          message: `Column "${h}" is missing.`,
        })),
      },
    );
  }
  const col = (h: string) => headers.get(norm(h))!;

  const lineSheet = workbook.getWorksheet(LINE_ITEMS_SHEET);
  let lineHeaders: Map<string, number> | null = null;
  if (lineSheet) {
    if (lineSheet.actualRowCount > MAX_LINE_ROWS) {
      throw payslipError(
        HttpStatus.BAD_REQUEST,
        'TOO_MANY_ROWS',
        `The "${LINE_ITEMS_SHEET}" sheet has too many rows.`,
      );
    }
    lineHeaders = headerIndex(lineSheet);
    const missingLine = REQUIRED_LINE_HEADERS.filter(
      (h) => !lineHeaders!.has(norm(h)),
    );
    if (missingLine.length > 0) {
      throw payslipError(
        HttpStatus.BAD_REQUEST,
        'WORKBOOK_PARSE_ERRORS',
        'The "LineItems" sheet does not use the current review workbook layout.',
        {
          errors: missingLine.map((h) => ({
            row: 1,
            field: h,
            code: 'MISSING_COLUMN',
            message: `Column "${h}" is missing on the LineItems sheet.`,
          })),
        },
      );
    }
  }

  // ── LineItems: allowance / arrears amount edits ───────────────────────────
  const lineEdits = new Map<string, LineEdit>();
  const lineRowOf = new Map<string, number>();
  if (lineSheet && lineHeaders) {
    const seenLines = new Set<string>();
    lineSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const staffId = cellText(
        row.getCell(lineHeaders.get(norm('StaffID'))!).value,
      );
      const lineName = cellText(
        row.getCell(lineHeaders.get(norm('LineName'))!).value,
      );
      const amountText = cellText(
        row.getCell(lineHeaders.get(norm('Amount'))!).value,
      );
      if (!staffId && !lineName && !amountText) return;

      const payslip = byStaff.get(staffId);
      if (!payslip) {
        errors.push({
          row: rowNumber,
          staffId,
          field: 'StaffID',
          code: 'UNKNOWN_STAFF_ID',
          message: `LineItems row ${rowNumber}: Staff ID "${staffId}" is not in this batch.`,
        });
        return;
      }
      const key = `${staffId}|${lineName}`;
      if (seenLines.has(key)) {
        errors.push({
          row: rowNumber,
          staffId,
          field: 'LineName',
          code: 'DUPLICATE_LINE',
          message: `LineItems row ${rowNumber}: "${lineName}" appears more than once for Staff ID ${staffId}.`,
        });
        return;
      }
      seenLines.add(key);

      const parsed = parseAmount(amountText);
      if (parsed.error) {
        errors.push({
          row: rowNumber,
          staffId,
          field: 'Amount',
          code: parsed.error,
          message: `LineItems row ${rowNumber}: Amount for "${lineName}" must be a non-negative number.`,
        });
        return;
      }
      if (parsed.value === undefined) return; // blank = no change
      if (lineName === 'Unknown') return; // a line with no allowance definition cannot be edited here

      const meta = definitions[lineName];
      if (!meta) {
        errors.push({
          row: rowNumber,
          staffId,
          field: 'LineName',
          code: 'UNSUPPORTED_ALLOWANCE',
          message: `LineItems row ${rowNumber}: "${lineName}" is not a supported allowance.`,
        });
        return;
      }
      const previous = currentAllowanceValue(payslip, lineName);
      if (sameNumber(previous, parsed.value)) return;

      const entry = lineEdits.get(staffId) ?? {
        allowances: {},
        arrears: {},
        changes: [],
      };
      (meta.parentCanonicalName ? entry.arrears : entry.allowances)[lineName] =
        parsed.value;
      entry.changes.push({
        field: `allowance.${lineName}`,
        previous,
        next: parsed.value,
      });
      lineEdits.set(staffId, entry);
      lineRowOf.set(staffId, lineRowOf.get(staffId) ?? rowNumber);
    });
  }

  // ── Payslips sheet: input edits and decisions ─────────────────────────────
  const rows: AnalysedRow[] = [];
  const edits: PlannedEdit[] = [];
  const decisions: PlannedDecision[] = [];
  const seenStaff = new Set<string>();
  const gated = new Set<string>();
  let netDelta = 0;
  const counts = {
    changed: 0,
    unchanged: 0,
    ignored: 0,
    decisionOnly: 0,
    invalid: 0,
  };

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const payslipIdCell = cellText(row.getCell(col('PayslipID')).value);
    const staffId = cellText(row.getCell(col('StaffID')).value);
    const rawDecision = cellText(row.getCell(col('HRDecision')).value);
    const note = cellText(row.getCell(col('ReviewNotes')).value) || undefined;
    if (!payslipIdCell && !staffId && !rawDecision && !note) return; // blank row

    const rowErrors: WorkbookError[] = [];
    const fail = (code: string, message: string, field?: string) =>
      rowErrors.push({
        row: rowNumber,
        staffId: staffId || undefined,
        field,
        code,
        message: `Row ${rowNumber}: ${message}`,
      });

    const payslip = byStaff.get(staffId);
    if (!payslip) {
      fail(
        'UNKNOWN_STAFF_ID',
        `Staff ID "${staffId}" is not in this batch.`,
        'StaffID',
      );
      errors.push(...rowErrors);
      counts.invalid++;
      return;
    }
    if (payslipIdCell && payslipIdCell !== payslip.id) {
      fail(
        'PAYSLIP_ID_MISMATCH',
        `PayslipID does not match Staff ID ${staffId}. The row was altered or came from another batch.`,
        'PayslipID',
      );
    }
    if (seenStaff.has(staffId)) {
      fail(
        'DUPLICATE_STAFF_ID',
        `Staff ID ${staffId} appears more than once.`,
        'StaffID',
      );
    }
    seenStaff.add(staffId);

    // Decision
    let decision: DecisionKind | null = null;
    if (rawDecision) {
      decision = mapDecision(rawDecision);
      if (!decision) {
        fail(
          'UNKNOWN_DECISION',
          `Unknown decision "${rawDecision}". Use APPROVE, HOLD, REJECT or leave it blank.`,
          'HRDecision',
        );
      } else if (
        (decision === 'HOLD' || decision === 'REJECT') &&
        (!note || note.length < 3)
      ) {
        fail(
          'NOTE_REQUIRED',
          `${decision} needs ReviewNotes of at least 3 characters.`,
          'ReviewNotes',
        );
      }
    }

    // Input edits
    const overrides: InputOverrides = {};
    const changes: RowChange[] = [];
    for (const field of INPUT_FIELDS) {
      const header = FIELD_HEADERS[field];
      const parsed = parseAmount(cellText(row.getCell(col(header)).value));
      if (parsed.error) {
        fail(parsed.error, `${header} must be a non-negative number.`, header);
        continue;
      }
      if (parsed.value === undefined) continue;
      const previous = currentFieldValue(payslip, field);
      if (sameNumber(previous, parsed.value)) continue;
      overrides[field] = parsed.value;
      changes.push({ field, previous, next: parsed.value });
    }

    const lineEdit = lineEdits.get(staffId);
    const hasEdit = changes.length > 0 || (lineEdit?.changes.length ?? 0) > 0;
    if (lineEdit) changes.push(...lineEdit.changes);

    // Day-count sanity (only when this edit touches the day counts)
    if (
      overrides.totalDays !== undefined ||
      overrides.daysWorked !== undefined
    ) {
      const inputs = inputsOf(payslip);
      const totalDays = overrides.totalDays ?? Number(inputs.totalDays ?? 0);
      const daysWorked = overrides.daysWorked ?? Number(inputs.daysWorked ?? 0);
      if (!(totalDays > 0))
        fail(
          'TOTAL_DAYS_NOT_POSITIVE',
          'TotalDays must be greater than zero.',
          'TotalDays',
        );
      else if (daysWorked > totalDays)
        fail(
          'DAYS_WORKED_EXCEEDS_TOTAL',
          `DaysWorked (${daysWorked}) is greater than TotalDays (${totalDays}).`,
          'DaysWorked',
        );
    }

    // Payslip state gating
    if (payslip.status === 'APPROVED' && (hasEdit || decision)) {
      if (hasEdit) {
        fail(
          'FINISH_APPROVAL_FIRST',
          `Staff ID ${staffId} is already approved. Approved payslips cannot be changed here; finish the approval, then correct it through a correction version.`,
        );
      } else {
        fail(
          'PAYSLIP_APPROVED_IMMUTABLE',
          `Staff ID ${staffId} is already approved and cannot receive a review decision.`,
        );
      }
      gated.add(payslip.id);
    } else if (
      payslip.status === 'REJECTED' &&
      hasEdit &&
      decision !== 'RESET'
    ) {
      fail(
        'REJECTED_PAYSLIP_EDIT',
        `Staff ID ${staffId} is rejected. Set HRDecision to RESET before editing it.`,
      );
    }

    // Recalculate (in memory) to show the effect of the edit
    let before: number | undefined;
    let after: number | undefined;
    let plannedEdit: PlannedEdit | null = null;
    if (hasEdit && rowErrors.length === 0) {
      plannedEdit = {
        payslipId: payslip.id,
        staffId,
        overrides,
        allowances: lineEdit?.allowances ?? {},
        arrears: lineEdit?.arrears ?? {},
      };
      try {
        const next = calculatePayslip(
          applyEditToInputs(inputsOf(payslip), plannedEdit),
          definitions,
        );
        before = Number(outputsOf(payslip).netServiceFee ?? 0);
        after = next.netServiceFee;
      } catch (err) {
        const message =
          err instanceof BadRequestException
            ? err.message
            : 'The payslip could not be recalculated.';
        fail('CALCULATION_FAILED', message);
        plannedEdit = null;
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      counts.invalid++;
      rows.push({
        payslipId: payslip.id,
        staffId,
        status: 'INVALID',
        decision,
        note,
        changes,
      });
      return;
    }

    let status: RowStatus;
    if (hasEdit) {
      status = 'CHANGED';
      counts.changed++;
      netDelta += (after ?? 0) - (before ?? 0);
    } else if (decision) {
      if (decision === 'REVIEWED' && payslip.status === 'IN_REVIEW') {
        status = 'UNCHANGED';
        counts.unchanged++;
      } else {
        status = 'DECISION_ONLY';
        counts.decisionOnly++;
      }
    } else {
      status = 'IGNORED';
      counts.ignored++;
    }

    if (plannedEdit) edits.push(plannedEdit);
    if (decision)
      decisions.push({ payslipId: payslip.id, staffId, decision, note });
    rows.push({
      payslipId: payslip.id,
      staffId,
      status,
      decision,
      note,
      changes,
      ...(after !== undefined
        ? {
            netServiceFeeBefore: (before ?? 0).toFixed(2),
            netServiceFeeAfter: after.toFixed(2),
          }
        : {}),
    });
  });

  // LineItems edits for a Staff ID that has no matching Payslips row would otherwise be dropped silently.
  for (const [staffId, entry] of lineEdits) {
    if (!seenStaff.has(staffId) && entry.changes.length > 0) {
      errors.push({
        row: lineRowOf.get(staffId) ?? 0,
        staffId,
        field: 'StaffID',
        code: 'LINE_EDIT_WITHOUT_PAYSLIP_ROW',
        message: `LineItems changes for Staff ID ${staffId} need that employee's row on the Payslips sheet too.`,
      });
      counts.invalid++;
    }
  }

  return {
    errors,
    rows,
    edits,
    decisions,
    summary: {
      ...counts,
      affectsApproved: gated.size,
      willCreateCorrectionVersion: false,
      netServiceFeeDelta: round2(netDelta).toFixed(2),
    },
  };
}
