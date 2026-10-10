jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PdfService } from './pdf.service';

describe('PdfService browser reuse', () => {
  let service: PdfService;
  let mockBrowser: any;
  let mockPage: any;
  let puppeteer: any;

  beforeEach(async () => {
    puppeteer = require('puppeteer');

    mockPage = {
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-generated')),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockBrowser = {
      connected: true,
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    puppeteer.launch = jest.fn().mockResolvedValue(mockBrowser);

    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfService],
    }).compile();

    service = module.get<PdfService>(PdfService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  const mockData: any = {
    companyName: 'Company',
    payingCompany: 'Payer',
    employeeName: 'John Doe',
    staffId: '1001',
    jobTitle: 'Dev',
    department: 'IT',
    month: 'JAN',
    year: 2026,
    daysWorked: 20,
    totalDays: 20,
    lines: [],
    consultantGrossPay: 100,
    grossEarnings: 100,
    wht: 5,
    otherDeduction: 0,
    totalDeductions: 5,
    nonTaxableAllowancesTotal: 0,
    netServiceFee: 95,
    engineVersion: '1.0',
    generatedAt: '2026-01-01',
  };

  it('reuses the same browser instance across multiple renders', async () => {
    const data = mockData;

    const buf1 = await service.generatePayslipPdf(data);
    const buf2 = await service.generatePayslipPdf(data);
    const buf3 = await service.generatePayslipPdf(data);

    expect(puppeteer.launch).toHaveBeenCalledTimes(1);
    expect(mockBrowser.newPage).toHaveBeenCalledTimes(3);
    expect(mockPage.close).toHaveBeenCalledTimes(3);
    expect(buf1).toEqual(Buffer.from('%PDF-generated'));
    expect(buf2).toEqual(Buffer.from('%PDF-generated'));
    expect(buf3).toEqual(Buffer.from('%PDF-generated'));
  });

  it('recreates browser after disconnect', async () => {
    const data = mockData;

    // Initial render
    await service.generatePayslipPdf(data);
    expect(puppeteer.launch).toHaveBeenCalledTimes(1);

    // Simulate disconnect event callback
    const disconnectCallback = mockBrowser.on.mock.calls.find((c: any) => c[0] === 'disconnected')?.[1];
    expect(disconnectCallback).toBeDefined();
    disconnectCallback();

    // Second render should launch a new browser
    const newBrowser: any = {
      connected: true,
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };
    puppeteer.launch.mockResolvedValueOnce(newBrowser);

    await service.generatePayslipPdf(data);
    expect(puppeteer.launch).toHaveBeenCalledTimes(2);
  });

  it('closes browser on onModuleDestroy', async () => {
    const data = mockData;
    await service.generatePayslipPdf(data);

    await service.onModuleDestroy();
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });
});
