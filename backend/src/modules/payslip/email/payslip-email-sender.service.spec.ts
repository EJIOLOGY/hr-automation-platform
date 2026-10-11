import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PayslipPdfReader } from '../pdf/payslip-pdf-reader.interface';
import {
  PayslipEmailSenderService,
  escapeHtml,
  sanitizeHeader,
} from './payslip-email-sender.service';

describe('PayslipEmailSenderService (SESv2)', () => {
  let service: PayslipEmailSenderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayslipEmailSenderService,
        {
          provide: PrismaService,
          useValue: {
            payslipDelivery: { findUnique: jest.fn(), update: jest.fn() },
            payslipDeliveryAttempt: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
            emailSuppression: { findFirst: jest.fn() },
            payslipEmailDispatch: { update: jest.fn() },
          },
        },
        {
          provide: PayslipPdfReader,
          useValue: { getReady: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'AWS_REGION') return 'eu-west-1';
              if (key === 'AWS_ACCESS_KEY_ID') return 'mock-key';
              if (key === 'AWS_SECRET_ACCESS_KEY') return 'mock-secret';
              if (key === 'PAYSLIP_FROM_EMAIL') return 'payslips@intertechsystemslimited.com';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PayslipEmailSenderService>(PayslipEmailSenderService);
  });

  describe('HTML escaping and header sanitization', () => {
    it('escapes dangerous HTML characters', () => {
      const input = '<script>alert(1)</script> & "Co"';
      expect(escapeHtml(input)).toBe('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Co&quot;');
    });

    it('strips newlines and carriage returns from headers to prevent header injection', () => {
      const input = 'Subject: Test\r\nBcc: hacker@example.com\nAnother';
      expect(sanitizeHeader(input)).toBe('Subject: Test Bcc: hacker@example.com Another');
    });
  });

  describe('Error classification table', () => {
    const testCases = [
      { err: { name: 'TooManyRequestsException' }, expectedKind: 'TRANSIENT' },
      { err: { name: 'ThrottlingException' }, expectedKind: 'TRANSIENT' },
      { err: { name: 'LimitExceededException' }, expectedKind: 'TRANSIENT' },
      { err: { name: 'SomeError', $metadata: { httpStatusCode: 429 } }, expectedKind: 'TRANSIENT' },
      { err: { name: 'SomeError', $metadata: { httpStatusCode: 503 } }, expectedKind: 'TRANSIENT' },
      {
        err: { name: 'MessageRejected', message: 'Email address is not verified. The following identities failed' },
        expectedKind: 'PERMANENT',
        expectedCode: 'SANDBOX_RECIPIENT_NOT_VERIFIED',
      },
      { err: { name: 'MessageRejected', message: 'Other rejection' }, expectedKind: 'PERMANENT' },
      { err: { name: 'BadRequestException' }, expectedKind: 'PERMANENT' },
      { err: { name: 'InvalidParameterValue' }, expectedKind: 'PERMANENT' },
      { err: { name: 'MailFromDomainNotVerifiedException' }, expectedKind: 'CONFIG_ERROR' },
      { err: { name: 'NotFoundException' }, expectedKind: 'CONFIG_ERROR' },
      { err: { name: 'CredentialsProviderError' }, expectedKind: 'CONFIG_ERROR' },
      { err: { name: 'UnrecognizedClientException' }, expectedKind: 'CONFIG_ERROR' },
      { err: { name: 'InvalidSignatureException' }, expectedKind: 'CONFIG_ERROR' },
      { err: { name: 'AccessDeniedException' }, expectedKind: 'CONFIG_ERROR' },
      { err: { name: 'AccountSuspendedException' }, expectedKind: 'ACCOUNT_PAUSED' },
      { err: { name: 'SendingPausedException' }, expectedKind: 'ACCOUNT_PAUSED' },
      { err: { name: 'TimeoutError', message: 'Socket timeout' }, expectedKind: 'UNKNOWN' },
      { err: { name: 'Error', message: 'read ECONNRESET' }, expectedKind: 'UNKNOWN' },
      { err: { name: 'Error', message: 'write EPIPE' }, expectedKind: 'UNKNOWN' },
      { err: { name: 'Error', message: 'socket hang up' }, expectedKind: 'UNKNOWN' },
      { err: { name: 'UnknownCustomError' }, expectedKind: 'UNKNOWN' },
    ];

    testCases.forEach(({ err, expectedKind, expectedCode }) => {
      it(`classifies ${err.name || 'Error'} as ${expectedKind}`, () => {
        const res = service.classifySesError(err);
        expect(res.kind).toBe(expectedKind);
        if (expectedCode && res.kind !== 'ACCEPTED') {
          expect(res.code).toBe(expectedCode);
        }
      });
    });
  });

  describe('Configuration guard', () => {
    it('returns CONFIG_ERROR if PAYSLIP_FROM_EMAIL is unset', async () => {
      delete process.env.PAYSLIP_FROM_EMAIL;
      const mod = await Test.createTestingModule({
        providers: [
          PayslipEmailSenderService,
          { provide: PrismaService, useValue: {} },
          { provide: PayslipPdfReader, useValue: {} },
          {
            provide: ConfigService,
            useValue: { get: () => null },
          },
        ],
      }).compile();

      const sender = mod.get<PayslipEmailSenderService>(PayslipEmailSenderService);
      const res = await sender.sendDelivery('del-1');
      expect(res.kind).toBe('CONFIG_ERROR');
      if (res.kind !== 'ACCEPTED') {
        expect(res.code).toBe('PAYSLIP_FROM_EMAIL_NOT_CONFIGURED');
      }
    });
  });
});
