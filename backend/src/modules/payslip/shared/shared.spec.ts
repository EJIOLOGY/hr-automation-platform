import { computePayslipContentHash } from './content-hash';
import { formatCurrencyString, sumToCurrencyString, toMinorUnits } from './currency';
import { computePayslipFlags } from './flags';
import { getTransactionOptions, runPayslipTransaction } from './payslip-transaction';
import { payslipError } from './payslip-error-codes';
import { payslipAuditMetadata, PAYSLIP_AUDIT_ACTOR } from './payslip-audit';
import { HttpStatus } from '@nestjs/common';

describe('Payslip Shared Utilities', () => {
  describe('content-hash', () => {
    it('produces identical hash for key-permuted inputs', () => {
      const inputA = {
        staffId: '1001',
        calculationInputs: { b: 2, a: 1 },
        calculationOutputs: { y: 20, x: 10 },
        lines: [
          { name: 'Housing', kind: 'BASE', amount: 500, taxClass: 'TAXABLE', sortOrder: 1 },
          { name: 'Basic', kind: 'BASE', amount: 1000, taxClass: 'TAXABLE', sortOrder: 0 },
        ],
      };

      const inputB = {
        lines: [
          { name: 'Basic', kind: 'BASE', amount: 1000, taxClass: 'TAXABLE', sortOrder: 0 },
          { name: 'Housing', kind: 'BASE', amount: 500, taxClass: 'TAXABLE', sortOrder: 1 },
        ],
        calculationOutputs: { x: 10, y: 20 },
        calculationInputs: { a: 1, b: 2 },
        staffId: '1001',
      };

      const hashA = computePayslipContentHash(inputA as any);
      const hashB = computePayslipContentHash(inputB as any);
      expect(hashA).toBe(hashB);
      expect(hashA).toHaveLength(64);
    });

    it('changes hash when any input value changes', () => {
      const baseInput = {
        staffId: '1001',
        calculationInputs: { baseFee: 10000 },
        calculationOutputs: { netServiceFee: 9500 },
        lines: [{ name: 'Basic', kind: 'BASE', amount: 10000, taxClass: 'TAXABLE', sortOrder: 0 }],
      };

      const changedInput = {
        ...baseInput,
        calculationOutputs: { netServiceFee: 9400 },
      };

      const hashA = computePayslipContentHash(baseInput as any);
      const hashB = computePayslipContentHash(changedInput as any);
      expect(hashA).not.toBe(hashB);
    });
  });

  describe('currency', () => {
    it('converts to minor units rounding accurately', () => {
      expect(toMinorUnits(1234.56)).toBe(123456);
      expect(toMinorUnits('1234.56')).toBe(123456);
      expect(toMinorUnits(null)).toBe(0);
    });

    it('sums avoids floating point traps like 0.1 + 0.2', () => {
      const sum = sumToCurrencyString([0.1, 0.2]);
      expect(sum).toBe('0.30');
    });

    it('formats currency strings to exactly 2 decimal places', () => {
      expect(formatCurrencyString(100)).toBe('100.00');
      expect(formatCurrencyString(100.5)).toBe('100.50');
      expect(formatCurrencyString(100.555)).toBe('100.56');
    });
  });

  describe('flags', () => {
    it('detects NET_NON_POSITIVE when net <= 0', () => {
      const flags = computePayslipFlags(
        { netServiceFee: 0, daysWorked: 20, totalDays: 20, otherDeduction: 0 },
        null,
        20,
      );
      expect(flags).toContainEqual({ code: 'NET_NON_POSITIVE', severity: 'WARN' });
    });

    it('detects DAYS_EXCEED_TOTAL when daysWorked > totalDays', () => {
      const flags = computePayslipFlags(
        { netServiceFee: 1000, daysWorked: 22, totalDays: 20, otherDeduction: 0 },
        null,
        20,
      );
      expect(flags).toContainEqual({ code: 'DAYS_EXCEED_TOTAL', severity: 'WARN' });
    });

    it('detects ZERO_DAYS_WORKED when daysWorked == 0', () => {
      const flags = computePayslipFlags(
        { netServiceFee: 1000, daysWorked: 0, totalDays: 20, otherDeduction: 0 },
        null,
        20,
      );
      expect(flags).toContainEqual({ code: 'ZERO_DAYS_WORKED', severity: 'WARN' });
    });

    it('detects OTHER_DEDUCTION_PRESENT when otherDeduction > 0', () => {
      const flags = computePayslipFlags(
        { netServiceFee: 1000, daysWorked: 20, totalDays: 20, otherDeduction: 50 },
        null,
        20,
      );
      expect(flags).toContainEqual({ code: 'OTHER_DEDUCTION_PRESENT', severity: 'INFO' });
    });

    it('detects NO_PREVIOUS_PAYSLIP when previous is null', () => {
      const flags = computePayslipFlags(
        { netServiceFee: 1000, daysWorked: 20, totalDays: 20, otherDeduction: 0 },
        null,
        20,
      );
      expect(flags).toContainEqual({ code: 'NO_PREVIOUS_PAYSLIP', severity: 'INFO' });
    });

    it('detects LARGE_VARIANCE_VS_PREVIOUS when variance exceeds threshold', () => {
      // previous: 1000, current: 1300 -> variance 30% > 20%
      const flags = computePayslipFlags(
        { netServiceFee: 1300, daysWorked: 20, totalDays: 20, otherDeduction: 0 },
        { netServiceFee: 1000 },
        20,
      );
      expect(flags).toContainEqual({ code: 'LARGE_VARIANCE_VS_PREVIOUS', severity: 'WARN' });
    });

    it('does NOT flag when variance is exactly at threshold', () => {
      // previous: 1000, current: 1200 -> variance exactly 20%
      const flags = computePayslipFlags(
        { netServiceFee: 1200, daysWorked: 20, totalDays: 20, otherDeduction: 0 },
        { netServiceFee: 1000 },
        20,
      );
      expect(flags.find((f) => f.code === 'LARGE_VARIANCE_VS_PREVIOUS')).toBeUndefined();
    });

    it('detects CHANGED_SINCE_REVIEW when changedSinceReview is true', () => {
      const flags = computePayslipFlags(
        { netServiceFee: 1000, daysWorked: 20, totalDays: 20, otherDeduction: 0, changedSinceReview: true },
        null,
        20,
      );
      expect(flags).toContainEqual({ code: 'CHANGED_SINCE_REVIEW', severity: 'WARN' });
    });
  });

  describe('payslip-transaction', () => {
    it('returns default configured timeouts', () => {
      expect(getTransactionOptions('BULK').timeout).toBe(60000);
      expect(getTransactionOptions('CALC').timeout).toBe(120000);
      expect(getTransactionOptions('ROW').timeout).toBe(15000);
      expect(getTransactionOptions('BULK').maxWait).toBe(10000);
    });

    it('maps P2028 timeout to 503 TRANSACTION_TIMEOUT', async () => {
      const prismaMock = {
        $transaction: jest.fn().mockRejectedValue({
          code: 'P2028',
          message: 'Transaction already closed: timeout',
        }),
      };

      await expect(
        runPayslipTransaction(prismaMock as any, 'BULK', async () => {}),
      ).rejects.toMatchObject({
        response: {
          code: 'TRANSACTION_TIMEOUT',
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        },
      });
    });
  });

  describe('audit helper', () => {
    it('formats audit metadata correctly with shared actor', () => {
      expect(PAYSLIP_AUDIT_ACTOR).toBe('HR_OFFICER');
      const meta = payslipAuditMetadata({
        companyId: 'c1',
        periodId: 'p1',
        batchId: 'b1',
        extraField: 123,
      });
      expect(meta).toEqual({
        companyId: 'c1',
        periodId: 'p1',
        batchId: 'b1',
        extraField: 123,
      });
    });
  });
});
