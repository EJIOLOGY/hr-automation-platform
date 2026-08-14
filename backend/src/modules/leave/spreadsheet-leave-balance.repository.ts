import { Inject, Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { PhoneNumberNormalizer } from '../../shared/utils/phone-number-normalizer';
import type {
  LeaveBalance,
  LeaveBalanceRepository,
} from './leave-balance.repository';

export const LEAVE_BALANCE_SPREADSHEET_PATH = Symbol(
  'LEAVE_BALANCE_SPREADSHEET_PATH',
);

export class LeaveBalanceRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeaveBalanceRepositoryError';
  }
}

/**
 * Read-only adapter for the HR-maintained CSV leave balance spreadsheet.
 * The file must have `phoneNumber` and `remainingDays` headers.
 */
@Injectable()
export class SpreadsheetLeaveBalanceRepository implements LeaveBalanceRepository {
  constructor(
    @Inject(LEAVE_BALANCE_SPREADSHEET_PATH)
    private readonly spreadsheetPath: string | undefined,
  ) {}

  async findByPhoneNumber(phoneNumber: string): Promise<LeaveBalance | null> {
    if (!this.spreadsheetPath) {
      throw new LeaveBalanceRepositoryError(
        'Leave balance spreadsheet path is not configured.',
      );
    }

    let spreadsheet: string;

    try {
      spreadsheet = await readFile(this.spreadsheetPath, 'utf8');
    } catch {
      throw new LeaveBalanceRepositoryError(
        'Leave balance spreadsheet is unavailable.',
      );
    }

    return this.readBalances(spreadsheet).get(phoneNumber) ?? null;
  }

  private readBalances(spreadsheet: string): Map<string, LeaveBalance> {
    const rows = parseCsv(spreadsheet);
    const [headers, ...dataRows] = rows;

    if (!headers) {
      throw new LeaveBalanceRepositoryError(
        'Leave balance spreadsheet is empty.',
      );
    }

    headers[0] = headers[0]?.replace(/^\uFEFF/, '');

    const phoneNumberColumn = headers.indexOf('phoneNumber');
    const remainingDaysColumn = headers.indexOf('remainingDays');

    if (phoneNumberColumn === -1 || remainingDaysColumn === -1) {
      throw new LeaveBalanceRepositoryError(
        'Leave balance spreadsheet must include phoneNumber and remainingDays headers.',
      );
    }

    const balances = new Map<string, LeaveBalance>();

    for (const [index, row] of dataRows.entries()) {
      if (row.every((value) => !value.trim())) {
        continue;
      }

      const phoneNumber = this.normalizeSpreadsheetPhoneNumber(
        row[phoneNumberColumn],
        index + 2,
      );
      const remainingDays = this.parseRemainingDays(
        row[remainingDaysColumn],
        index + 2,
      );

      if (balances.has(phoneNumber)) {
        throw new LeaveBalanceRepositoryError(
          `Duplicate phone number in leave balance spreadsheet at row ${index + 2}.`,
        );
      }

      balances.set(phoneNumber, { remainingDays });
    }

    return balances;
  }

  private normalizeSpreadsheetPhoneNumber(
    phoneNumber: string | undefined,
    rowNumber: number,
  ): string {
    try {
      return PhoneNumberNormalizer.normalize(phoneNumber ?? '');
    } catch {
      throw new LeaveBalanceRepositoryError(
        `Invalid phone number in leave balance spreadsheet at row ${rowNumber}.`,
      );
    }
  }

  private parseRemainingDays(
    value: string | undefined,
    rowNumber: number,
  ): number {
    const remainingDays = Number(value);

    if (!Number.isFinite(remainingDays) || remainingDays < 0) {
      throw new LeaveBalanceRepositoryError(
        `Invalid remainingDays value in leave balance spreadsheet at row ${rowNumber}.`,
      );
    }

    return remainingDays;
  }
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let isQuoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (character === '"') {
      if (isQuoted && content[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        isQuoted = !isQuoted;
      }
    } else if (character === ',' && !isQuoted) {
      row.push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !isQuoted) {
      if (character === '\r' && content[index + 1] === '\n') {
        index += 1;
      }

      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  if (isQuoted) {
    throw new LeaveBalanceRepositoryError(
      'Leave balance spreadsheet contains an unterminated quoted value.',
    );
  }

  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}
