import { LeaveService } from './leave.service';
import {
  LEAVE_BALANCE_REPOSITORY,
  LeaveBalanceRepository,
} from './leave-balance.repository';
import { EmployeePhoneLookup } from './leave.service';

describe('LeaveService', () => {
  let service: LeaveService;
  let employeeLookup: jest.Mocked<EmployeePhoneLookup>;
  let leaveBalanceRepository: jest.Mocked<LeaveBalanceRepository>;

  beforeEach(() => {
    employeeLookup = {
      findByPhoneNumber: jest.fn(),
    };
    leaveBalanceRepository = {
      findByPhoneNumber: jest.fn(),
    };

    service = new LeaveService(employeeLookup, leaveBalanceRepository);
  });

  it('returns the known employee leave balance', async () => {
    employeeLookup.findByPhoneNumber.mockResolvedValue({});
    leaveBalanceRepository.findByPhoneNumber.mockResolvedValue({
      remainingDays: 12,
    });

    await expect(
      service.getLeaveBalanceByPhone('08012345678'),
    ).resolves.toEqual({
      status: 'available',
      balance: { remainingDays: 12 },
    });
  });

  it('returns employee-not-found when no employee matches the phone number', async () => {
    employeeLookup.findByPhoneNumber.mockResolvedValue(null);

    await expect(
      service.getLeaveBalanceByPhone('+2348012345678'),
    ).resolves.toEqual({ status: 'employee-not-found' });
    expect(leaveBalanceRepository.findByPhoneNumber).not.toHaveBeenCalled();
  });

  it('returns unavailable when the employee has no leave balance', async () => {
    employeeLookup.findByPhoneNumber.mockResolvedValue({});
    leaveBalanceRepository.findByPhoneNumber.mockResolvedValue(null);

    await expect(
      service.getLeaveBalanceByPhone('+2348012345678'),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('returns unavailable when the leave balance repository fails', async () => {
    employeeLookup.findByPhoneNumber.mockResolvedValue({});
    leaveBalanceRepository.findByPhoneNumber.mockRejectedValue(
      new Error('Spreadsheet unavailable'),
    );

    await expect(
      service.getLeaveBalanceByPhone('+2348012345678'),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('normalizes phone numbers before lookup and rejects invalid values', async () => {
    employeeLookup.findByPhoneNumber.mockResolvedValue(null);

    await service.getLeaveBalanceByPhone('08012345678');

    expect(employeeLookup.findByPhoneNumber).toHaveBeenCalledWith(
      '+2348012345678',
    );

    await expect(service.getLeaveBalanceByPhone('invalid')).resolves.toEqual({
      status: 'invalid-phone-number',
    });
    expect(employeeLookup.findByPhoneNumber).toHaveBeenCalledTimes(1);
  });
});
