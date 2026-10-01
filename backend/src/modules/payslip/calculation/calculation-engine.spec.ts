import { BadRequestException } from '@nestjs/common';
import {
  AllowanceClass,
  PayslipLineKind,
} from '../../../generated/prisma/client';
import { calculatePayslip } from './calculation-engine';

describe('calculatePayslip', () => {
  describe('Section 7 Worked Example (Uche Emmanuel Chukwuma, Staff ID 2230355)', () => {
    it('matches the exact figures from Section 7 of the research blueprint', () => {
      const result = calculatePayslip({
        staffId: '2230355',
        baseFee: 776160,
        totalDays: 31,
        daysWorked: 31,
        daysAbsent: 0,
        allowances: {
          publicHoliday: 51744,
        },
        cellCoordinates: {
          publicHoliday: 'ALLOWANCE SPREAD SHEET!V16',
          baseFee: 'INVOICE SPREAD SHEET!D16',
        },
      });

      expect(result.consultantGrossPay).toBe(776160);
      expect(result.taxableEarningsTotal).toBe(51744);
      expect(result.grossEarnings).toBe(827904);
      expect(result.wht).toBe(41395.2);
      expect(result.otherDeduction).toBe(0);
      expect(result.totalDeductions).toBe(41395.2);
      expect(result.nonTaxableAllowancesTotal).toBe(0);
      expect(result.netServiceFee).toBe(786508.8);

      // Verify line items generated
      expect(result.lines).toHaveLength(1);
      const line = result.lines[0];
      expect(line.canonicalName).toBe('publicHoliday');
      expect(line.name).toBe('Public Holiday');
      expect(line.kind).toBe(PayslipLineKind.BASE);
      expect(line.amount).toBe(51744);
      expect(line.taxClass).toBe(AllowanceClass.PAYSLIP_MAPPED_TAXABLE);
      expect(line.sourceCell).toBe('ALLOWANCE SPREAD SHEET!V16');
    });
  });

  describe('Non-Taxable Allowances Scenarios', () => {
    it('adds all six non-taxable allowances directly into Net Service Fee without increasing WHT', () => {
      const result = calculatePayslip({
        staffId: '1001',
        baseFee: 500000,
        totalDays: 30,
        daysWorked: 30,
        allowances: {
          transportAllowance: 20000,
          accommodationAllowance: 30000,
          timeOffTransportAllowance: 10000,
          feedingAllowance: 15000,
          outStationAllowance: 25000,
          christmasBonus: 50000,
          marriageSupportGrant: 40000,
        },
      });

      // Consultant Gross Pay = 500,000
      expect(result.consultantGrossPay).toBe(500000);
      // No taxable allowances added
      expect(result.taxableEarningsTotal).toBe(0);
      expect(result.grossEarnings).toBe(500000);
      // WHT = 5% of 500,000 = 25,000
      expect(result.wht).toBe(25000);
      expect(result.totalDeductions).toBe(25000);

      // Non-taxable total = 20,000 + 30,000 + 10,000 + 15,000 + 25,000 + 50,000 + 40,000 = 190,000
      expect(result.nonTaxableAllowancesTotal).toBe(190000);

      // Net Service Fee = Gross (500,000) - Total Deductions (25,000) + Non-taxable (190,000) = 665,000
      expect(result.netServiceFee).toBe(665000);

      // All 7 lines present with NONTAXABLE tax class
      expect(result.lines).toHaveLength(7);
      expect(
        result.lines.every(
          (l) => l.taxClass === AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
        ),
      ).toBe(true);
    });
  });

  describe('Taxable Bonus and Dynamic Arrears Scenarios', () => {
    it('includes Performance Bonus and 13th Month in Gross Earnings and WHT calculation', () => {
      const result = calculatePayslip({
        staffId: '1002',
        baseFee: 400000,
        totalDays: 20,
        daysWorked: 20,
        allowances: {
          performanceBonus: 50000,
          thirteenthMonth: 100000,
        },
      });

      // Consultant Gross Pay = 400,000
      // Taxable = 150,000
      // Gross = 550,000
      expect(result.consultantGrossPay).toBe(400000);
      expect(result.taxableEarningsTotal).toBe(150000);
      expect(result.grossEarnings).toBe(550000);
      // WHT = 5% of 550,000 = 27,500
      expect(result.wht).toBe(27500);
      // Net Service Fee = 550,000 - 27,500 = 522,500
      expect(result.netServiceFee).toBe(522500);
    });

    it('generates companion arrears line items without double counting', () => {
      const result = calculatePayslip({
        staffId: '1003',
        baseFee: 300000,
        totalDays: 30,
        daysWorked: 30,
        allowances: {
          overtime: 30000,
          transportAllowance: 20000,
        },
        arrears: {
          arrearsOvertime: 10000,
          arrearsTransportAllowance: 5000,
        },
      });

      // Taxable: overtime (30,000) + arrearsOvertime (10,000) = 40,000
      expect(result.taxableEarningsTotal).toBe(40000);
      expect(result.grossEarnings).toBe(340000);
      expect(result.wht).toBe(17000);

      // Non-taxable: transport (20,000) + arrearsTransport (5,000) = 25,000
      expect(result.nonTaxableAllowancesTotal).toBe(25000);

      // Net Service Fee = 340,000 - 17,000 + 25,000 = 348,000
      expect(result.netServiceFee).toBe(348000);

      // Check lines
      expect(result.lines).toHaveLength(4);
      const arrearsOvertimeLine = result.lines.find(
        (l) => l.canonicalName === 'arrearsOvertime',
      );
      expect(arrearsOvertimeLine?.kind).toBe(PayslipLineKind.ARREARS);
      expect(arrearsOvertimeLine?.parentCanonicalName).toBe('overtime');
      expect(arrearsOvertimeLine?.taxClass).toBe(
        AllowanceClass.PAYSLIP_MAPPED_TAXABLE,
      );

      const arrearsTransportLine = result.lines.find(
        (l) => l.canonicalName === 'arrearsTransportAllowance',
      );
      expect(arrearsTransportLine?.kind).toBe(PayslipLineKind.ARREARS);
      expect(arrearsTransportLine?.parentCanonicalName).toBe(
        'transportAllowance',
      );
      expect(arrearsTransportLine?.taxClass).toBe(
        AllowanceClass.PAYSLIP_MAPPED_NONTAXABLE,
      );
    });

    it('subtracts Other Deduction inside Total Deductions', () => {
      const result = calculatePayslip({
        staffId: '1004',
        baseFee: 200000,
        totalDays: 20,
        daysWorked: 20,
        otherDeduction: 15000,
      });

      expect(result.grossEarnings).toBe(200000);
      expect(result.wht).toBe(10000);
      expect(result.otherDeduction).toBe(15000);
      expect(result.totalDeductions).toBe(25000); // 10,000 WHT + 15,000 Other
      expect(result.netServiceFee).toBe(175000); // 200,000 - 25,000
    });
  });

  describe('Validation & Edge Cases', () => {
    it('blocks totalDays <= 0 with validation error', () => {
      expect(() =>
        calculatePayslip({
          staffId: '1005',
          baseFee: 500000,
          totalDays: 0,
          daysWorked: 0,
        }),
      ).toThrow(BadRequestException);
    });

    it('handles pro-rated days worked with fractional calculation', () => {
      const result = calculatePayslip({
        staffId: '1006',
        baseFee: 600000,
        totalDays: 30,
        daysWorked: 15,
      });

      expect(result.consultantGrossPay).toBe(300000);
      expect(result.grossEarnings).toBe(300000);
      expect(result.wht).toBe(15000);
      expect(result.netServiceFee).toBe(285000);
    });
  });
});
