import { readFile } from 'node:fs/promises';
import {
  LeaveBalanceRepositoryError,
  SpreadsheetLeaveBalanceRepository,
} from './spreadsheet-leave-balance.repository';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));

describe('SpreadsheetLeaveBalanceRepository', () => {
  const readFileMock = jest.mocked(readFile);
  const repository = new SpreadsheetLeaveBalanceRepository(
    '/secured/hr/leave-balances.csv',
  );

  beforeEach(() => {
    readFileMock.mockReset();
  });

  it('reads a known employee balance using the normalized spreadsheet phone key', async () => {
    readFileMock.mockResolvedValue(
      '\uFEFFphoneNumber,remainingDays\n08012345678,12\n',
    );

    await expect(
      repository.findByPhoneNumber('+2348012345678'),
    ).resolves.toEqual({ remainingDays: 12 });
  });

  it('returns null when a phone number has no spreadsheet row', async () => {
    readFileMock.mockResolvedValue(
      'phoneNumber,remainingDays\n08012345678,12\n',
    );

    await expect(
      repository.findByPhoneNumber('+2348098765432'),
    ).resolves.toBeNull();
  });

  it('wraps spreadsheet read failures without exposing filesystem errors', async () => {
    readFileMock.mockRejectedValue(new Error('EACCES: permission denied'));

    await expect(
      repository.findByPhoneNumber('+2348012345678'),
    ).rejects.toBeInstanceOf(LeaveBalanceRepositoryError);
  });

  it('rejects malformed spreadsheet data', async () => {
    readFileMock.mockResolvedValue(
      'phoneNumber,remainingDays\n08012345678,-1\n',
    );

    await expect(
      repository.findByPhoneNumber('+2348012345678'),
    ).rejects.toBeInstanceOf(LeaveBalanceRepositoryError);
  });
});
