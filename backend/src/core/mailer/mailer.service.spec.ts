import { ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service';

const sendMock = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

describe('MailerService', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  const buildConfig = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  describe('sendMail', () => {
    it('throws without attempting to send when RESEND_API_KEY is missing', async () => {
      const service = new MailerService(
        buildConfig({ MAIL_FROM_ADDRESS: 'hr@intertechsystemsltd.com' }),
      );

      await expect(
        service.sendMail({
          to: 'officer@intertechsystemsltd.com',
          subject: 'Test',
          html: '<p>Test</p>',
          text: 'Test',
        }),
      ).rejects.toThrow('RESEND_API_KEY is not configured.');

      expect(sendMock).not.toHaveBeenCalled();
    });

    it('throws without attempting to send when MAIL_FROM_ADDRESS is missing', async () => {
      const service = new MailerService(
        buildConfig({ RESEND_API_KEY: 're_test_123' }),
      );

      await expect(
        service.sendMail({
          to: 'officer@intertechsystemsltd.com',
          subject: 'Test',
          html: '<p>Test</p>',
          text: 'Test',
        }),
      ).rejects.toThrow('MAIL_FROM_ADDRESS is not configured.');

      expect(sendMock).not.toHaveBeenCalled();
    });

    it('sends via Resend with the configured sender address', async () => {
      sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null });

      const service = new MailerService(
        buildConfig({
          RESEND_API_KEY: 're_test_123',
          MAIL_FROM_ADDRESS: 'Intertech HR <hr@intertechsystemsltd.com>',
        }),
      );

      await service.sendMail({
        to: 'officer@intertechsystemsltd.com',
        subject: 'Test subject',
        html: '<p>Test</p>',
        text: 'Test',
      });

      expect(sendMock).toHaveBeenCalledWith({
        from: 'Intertech HR <hr@intertechsystemsltd.com>',
        to: 'officer@intertechsystemsltd.com',
        subject: 'Test subject',
        html: '<p>Test</p>',
        text: 'Test',
      });
    });

    it('throws and logs when Resend returns an error', async () => {
      sendMock.mockResolvedValue({
        data: null,
        error: { message: 'Invalid API key', statusCode: 401 },
      });

      const service = new MailerService(
        buildConfig({
          RESEND_API_KEY: 're_test_123',
          MAIL_FROM_ADDRESS: 'hr@intertechsystemsltd.com',
        }),
      );

      await expect(
        service.sendMail({
          to: 'officer@intertechsystemsltd.com',
          subject: 'Test',
          html: '<p>Test</p>',
          text: 'Test',
        }),
      ).rejects.toThrow('Failed to send email: Invalid API key');
    });

    it('reuses the same Resend client across multiple sends', async () => {
      sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null });

      const resendModule = jest.requireMock<{ Resend: jest.Mock }>('resend');
      resendModule.Resend.mockClear();

      const service = new MailerService(
        buildConfig({
          RESEND_API_KEY: 're_test_123',
          MAIL_FROM_ADDRESS: 'hr@intertechsystemsltd.com',
        }),
      );

      await service.sendMail({
        to: 'a@intertechsystemsltd.com',
        subject: 'One',
        html: '<p>One</p>',
        text: 'One',
      });
      await service.sendMail({
        to: 'b@intertechsystemsltd.com',
        subject: 'Two',
        html: '<p>Two</p>',
        text: 'Two',
      });

      expect(resendModule.Resend).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends a branded reset email containing the reset URL', async () => {
      sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null });

      const service = new MailerService(
        buildConfig({
          RESEND_API_KEY: 're_test_123',
          MAIL_FROM_ADDRESS: 'hr@intertechsystemsltd.com',
        }),
      );

      const resetUrl =
        'https://hr.intertechsystemsltd.com/reset-password?token=abc123';

      await service.sendPasswordResetEmail(
        'officer@intertechsystemsltd.com',
        resetUrl,
      );

      expect(sendMock).toHaveBeenCalledTimes(1);
      const [payload] = sendMock.mock.calls[0] as [
        { to: string; subject: string; html: string; text: string },
      ];

      expect(payload.to).toBe('officer@intertechsystemsltd.com');
      expect(payload.subject).toContain('Reset your');
      expect(payload.html).toContain(resetUrl);
      expect(payload.text).toContain(resetUrl);
    });
  });
});
