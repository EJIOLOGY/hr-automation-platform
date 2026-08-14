import { Injectable } from '@nestjs/common';

export interface LeaveBalance {
  remainingDays: number;
}

/**
 * Isolates the current temporary data source from the conversation layer.
 * Replace the bound implementation with the spreadsheet adapter when available.
 */
export interface LeaveBalanceRepository {
  findByPhoneNumber(phoneNumber: string): Promise<LeaveBalance | null>;
}

export const LEAVE_BALANCE_REPOSITORY = Symbol('LEAVE_BALANCE_REPOSITORY');

/**
 * Development-only placeholder until the maintained leave spreadsheet adapter
 * is available. It intentionally contains no employee data.
 */
@Injectable()
export class InMemoryLeaveBalanceRepository implements LeaveBalanceRepository {
  private readonly balances = new Map<string, LeaveBalance>();

  async findByPhoneNumber(phoneNumber: string): Promise<LeaveBalance | null> {
    return this.balances.get(phoneNumber) ?? null;
  }
}
