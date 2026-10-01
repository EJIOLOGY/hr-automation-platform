import { Test, TestingModule } from '@nestjs/testing';
import { PayslipRenderService } from './payslip-render.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PayslipLineKind, AllowanceClass } from '../../../generated/prisma/client';
import { NotFoundException } from '@nestjs/common';

describe('PayslipRenderService', () => {
  let service: PayslipRenderService;
  let prisma: any;

  beforeEach(async () => {
    const prismaMock = {
      payslip: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayslipRenderService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<PayslipRenderService>(PayslipRenderService);
    prisma = module.get(PrismaService);
  });

  it('Builds correct PayslipHtmlData from mock DB payslip', async () => {
    const mockDbPayslip = {
      id: 'p1',
      staffId: 'STAFF-1',
      employee: { fullName: 'John Doe', jobTitle: 'Developer', department: 'Engineering' },
      lines: [
        { name: 'Basic Salary', kind: PayslipLineKind.BASE, taxClass: AllowanceClass.PAYSLIP_MAPPED_TAXABLE, amount: 100000 },
        { name: 'Penalty', kind: PayslipLineKind.BASE, taxClass: AllowanceClass.PAYSLIP_MAPPED_TAXABLE, amount: -5000 },
      ],
      payslipBatch: {
        payrollPeriod: { month: 'October', year: 2026 },
        accountingCompany: { name: 'Tech Corp' },
      },
      calculationInputs: {
        daysWorked: 20,
        totalDays: 22,
        inputMetadata: { payingCompany: 'Tech Corp Payment Entity' }
      },
      calculationOutputs: {
        consultantGrossPay: 100000,
        grossEarnings: 95000,
        netServiceFee: 90000,
        engineVersion: '1.2.0'
      }
    };

    prisma.payslip.findUnique.mockResolvedValue(mockDbPayslip as any);

    const data = await service.getPayslipData('p1');

    expect(data.employeeName).toBe('John Doe');
    expect(data.payingCompany).toBe('Tech Corp Payment Entity');
    expect(data.lines).toHaveLength(2);
    expect(data.lines[1].isDeduction).toBe(true);
    expect(data.lines[1].amount).toBe(5000);
    expect(data.netServiceFee).toBe(90000);
    expect(data.engineVersion).toBe('1.2.0');
  });

  it('Handles missing employee gracefully (employee = null -> fullName = staffId)', async () => {
    const mockDbPayslip = {
      id: 'p2',
      staffId: 'STAFF-99',
      employee: null,
      lines: [],
      payslipBatch: {
        payrollPeriod: { month: 'October', year: 2026 },
        accountingCompany: { name: 'Tech Corp' },
      },
      calculationInputs: {},
      calculationOutputs: {}
    };

    prisma.payslip.findUnique.mockResolvedValue(mockDbPayslip as any);

    const data = await service.getPayslipData('p2');
    expect(data.employeeName).toBe('STAFF-99');
  });
});
