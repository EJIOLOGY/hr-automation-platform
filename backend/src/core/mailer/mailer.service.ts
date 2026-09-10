import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Thin wrapper around Resend for transactional email. Responsible only for
 * delivery and message formatting — it has no knowledge of HR officers,
 * auth tokens, or any other domain concept. Callers (e.g. AuthService)
 * decide what to send and when.
 *
 * Configuration is read lazily, at send time, rather than at construction —
 * matching the pattern already used for JWT secrets in AuthService and for
 * WhatsApp credentials in WhatsappGraphClient — so a missing API key
 * surfaces as a clear error only when an email is actually attempted,
 * rather than preventing the whole app from booting.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private client: Resend | null = null;

  constructor(private readonly configService: ConfigService) {}

  async sendMail(input: SendMailInput): Promise<void> {
    const client = this.getClient();
    const from = this.getFromAddress();

    const { error } = await client.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    if (error) {
      this.logger.error(
        `Failed to send email to ${input.to}: ${error.message}`,
      );
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Sends the HR officer password-reset email. The caller is responsible
   * for generating the token, building `resetUrl` with it, and deciding
   * how long the link should remain valid — this method only formats and
   * delivers the message. `resetUrl` should already contain the raw
   * (unhashed) reset token as a query parameter.
   */
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.sendMail({
      to,
      subject: 'Reset your Intertech HR Assistant password',
      html: this.buildPasswordResetHtml(resetUrl),
      text: [
        'We received a request to reset your Intertech HR Assistant password.',
        '',
        'Open the link below to choose a new password. This link expires in 60 minutes and can only be used once.',
        '',
        resetUrl,
        '',
        'If you did not request this, you can safely ignore this email — your password will not be changed.',
      ].join('\n'),
    });
  }

  private getClient(): Resend {
    if (this.client) {
      return this.client;
    }

    const apiKey = this.configService.get<string>('RESEND_API_KEY');

    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured.');
    }

    this.client = new Resend(apiKey);
    return this.client;
  }

  private getFromAddress(): string {
    const from = this.configService.get<string>('MAIL_FROM_ADDRESS');

    if (!from) {
      throw new Error('MAIL_FROM_ADDRESS is not configured.');
    }

    return from;
  }

  private buildPasswordResetHtml(resetUrl: string): string {
    return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#0f766e;padding:20px 32px;">
                <span style="color:#ffffff;font-size:16px;font-weight:bold;">Intertech HR Assistant</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#18181b;">
                <p style="margin:0 0 16px 0;font-size:15px;line-height:22px;">
                  We received a request to reset your Intertech HR Assistant password.
                </p>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:22px;">
                  This link expires in 60 minutes and can only be used once.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:6px;background-color:#0f766e;">
                      <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
                        Reset Password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0 0;font-size:13px;line-height:20px;color:#71717a;">
                  If you did not request this, you can safely ignore this email — your password will not be changed.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }
}
