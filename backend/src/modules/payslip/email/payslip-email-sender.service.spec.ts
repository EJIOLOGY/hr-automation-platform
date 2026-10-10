import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PayslipPdfReader } from '../pdf/payslip-pdf-reader.interface';
import { PayslipEmailSenderService } from './payslip-email-sender.service';
import { PayslipDeliveryAttemptTrigger, PayslipDeliveryStatus, PayslipStatus } from '../../../generated/prisma/client';

describe('PayslipEmailSenderService', () => {
  let service: PayslipEmailSenderService;
  let prisma: any;
  let pdfReader: any;

  beforeEach(async () => {
    prisma = {
      payslipDelivery: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payslipDeliveryAttempt: {
        create: jest.fn().mockResolvedValue({ id: 'attempt-1' }),
        update: jest.fn(),
      },
      emailSuppression: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    pdfReader = {
      getReady: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayslipEmailSenderService,
        { provide: PrismaService, useValue: prisma },
        { provide: PayslipPdfReader, useValue: pdfReader },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'AWS_REGION') return 'us-east-1';
              if (key === 'AWS_ACCESS_KEY_ID') return 'mock-key';
              if (key === 'AWS_SECRET_ACCESS_KEY') return 'mock-secret';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PayslipEmailSenderService>(PayslipEmailSenderService);
  });

  it('builds raw MIME email containing headers and PDF attachment', () => {
    const raw = service.buildRawEmail({
      from: 'hr@example.com',
      to: 'emp@example.com',
      subject: 'Test Payslip',
      bodyText: 'Hello world',
      bodyHtml: '<p>Hello world</p>',
      pdfBuffer: Buffer.from('%PDF-1.4 mock'),
      pdfFilename: 'test.pdf',
    });

    const emailStr = raw.toString();
    expect(emailStr).toContain('From: hr@example.com');
    expect(emailStr).toContain('To: emp@example.com');
    expect(emailStr).toContain('Content-Type: multipart/mixed;');
    expect(emailStr).toContain('Content-Type: application/pdf; name="test.pdf"');
  });

  it('fails with SUPPRESSED_ADDRESS if recipient is in active suppression list', async () => {
    prisma.payslipDelivery.update.mockResolvedValue({ attemptCount: 1 });
    prisma.payslipDelivery.findUnique.mockResolvedValue({
      id: 'del-1',
      payslipId: 'slip-1',
      recipientEmailSnapshot: 'suppressed@example.com',
      payslip: {
        status: PayslipStatus.APPROVED,
        payslipBatch: {
          payrollPeriod: { name: 'Jan 2026' },
          accountingCompany: { name: 'Acme' },
        },
      },
      employee: {
        email: 'suppressed@example.com',
        fullName: 'Jane Doe',
      },
    });

    prisma.emailSuppression.findFirst.mockResolvedValue({
      id: 'sup-1',
      reason: 'HARD_BOUNCE',
    });

    const result = await service.sendDelivery('del-1', PayslipDeliveryAttemptTrigger.AUTOMATIC);
    expect(result.outcome).toBe('CONFIRMED_FAILURE');
    expect(result.errorCode).toBe('SUPPRESSED_ADDRESS');
  });
});
