import { Inject, Injectable } from '@nestjs/common';
import { LEAVE_BALANCE_REPOSITORY } from './leave-balance.repository';
import type {
  LeaveBalance,
  LeaveBalanceRepository,
} from './leave-balance.repository';
import { PhoneNumberNormalizer } from '../../shared/utils/phone-number-normalizer';

export type LeaveBalanceLookupResult =
  | { status: 'available'; balance: LeaveBalance }
  | { status: 'employee-not-found' }
  | { status: 'unavailable' }
  | { status: 'invalid-phone-number' };

export interface EmployeePhoneLookup {
  findByPhoneNumber(phoneNumber: string): Promise<unknown | null>;
}

export const EMPLOYEE_PHONE_LOOKUP = Symbol('EMPLOYEE_PHONE_LOOKUP');

@Injectable()
export class LeaveService {
  constructor(
    @Inject(EMPLOYEE_PHONE_LOOKUP)
    private readonly employeeLookup: EmployeePhoneLookup,
    @Inject(LEAVE_BALANCE_REPOSITORY)
    private readonly leaveBalanceRepository: LeaveBalanceRepository,
  ) {}

  async getLeaveBalanceByPhone(
    phoneNumber: string,
  ): Promise<LeaveBalanceLookupResult> {
    let normalizedPhoneNumber: string;

    try {
      normalizedPhoneNumber = PhoneNumberNormalizer.normalize(phoneNumber);
    } catch {
      return { status: 'invalid-phone-number' };
    }

    const employee = await this.employeeLookup.findByPhoneNumber(
      normalizedPhoneNumber,
    );

    if (!employee) {
      return { status: 'employee-not-found' };
    }

    let balance: LeaveBalance | null;

    try {
      balance = await this.leaveBalanceRepository.findByPhoneNumber(
        normalizedPhoneNumber,
      );
    } catch {
      return { status: 'unavailable' };
    }

    return balance
      ? { status: 'available', balance }
      : { status: 'unavailable' };
  }
}
