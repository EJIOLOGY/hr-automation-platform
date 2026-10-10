import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PayslipPdfReader } from '../pdf/payslip-pdf-reader.interface';
import {
  EmailSuppressionStatus,
  PayslipDeliveryAttemptOutcome,
  PayslipDeliveryAttemptTrigger,
  PayslipDeliveryStatus,
  PayslipStatus,
} from '../../../generated/prisma/client';
import { maskEmail, normalizeEmail } from '../../employee/email-utils';

export interface SendPayslipEmailResult {
  outcome: PayslipDeliveryAttemptOutcome;
  sesMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class PayslipEmailSenderService {
  private readonly logger = new Logger(PayslipEmailSenderService.name);
  private sesClient: SESClient | null = null;
  private readonly isConfigured: boolean;

  // Simple token-bucket rate limiter (cap at 14 sends/second by default)
  private tokens: number = 14;
  private readonly maxTokens: number = 14;
  private lastRefill: number = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly pdfReader: PayslipPdfReader,
  ) {
    const region = this.configService.get<string>('AWS_REGION') || process.env.AWS_REGION;
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID') || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || process.env.AWS_SECRET_ACCESS_KEY;

    if (region && accessKeyId && secretAccessKey) {
      this.sesClient = new SESClient({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.isConfigured = true;
    } else {
      this.isConfigured = false;
      this.logger.warn('AWS SES credentials are not fully configured. Live sends will fail with SES_NOT_CONFIGURED.');
    }
  }

  getIsConfigured(): boolean {
    return this.isConfigured;
  }

  private async acquireToken(): Promise<void> {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.maxTokens);
    this.lastRefill = now;

    if (this.tokens < 1) {
      const waitMs = Math.ceil(((1 - this.tokens) / this.maxTokens) * 1000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.acquireToken();
    }
    this.tokens -= 1;
  }

  /**
   * Pre-send eligibility check for a delivery record.
   */
  async checkEligibility(deliveryId: string): Promise<{
    eligible: boolean;
    reason?: string;
    delivery?: any;
    employeeEmail?: string;
  }> {
    const delivery = await this.prisma.payslipDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        payslip: {
          include: {
            payslipBatch: {
              include: {
                payrollPeriod: true,
                accountingCompany: true,
              },
            },
          },
        },
        employee: true,
      },
    });

    if (!delivery) {
      return { eligible: false, reason: 'Delivery record not found.' };
    }

    if (delivery.payslip.status !== PayslipStatus.APPROVED) {
      return { eligible: false, reason: 'Payslip is not APPROVED.', delivery };
    }

    const email = delivery.recipientEmailSnapshot || delivery.employee?.email;
    if (!email) {
      return { eligible: false, reason: 'Employee has no email address configured.', delivery };
    }

    const normalized = normalizeEmail(email);

    // Check suppression list
    const suppression = await this.prisma.emailSuppression.findFirst({
      where: {
        emailNormalized: normalized,
        status: EmailSuppressionStatus.ACTIVE,
      },
    });

    if (suppression) {
      return { eligible: false, reason: `Recipient email is suppressed (${suppression.reason}).`, delivery };
    }

    return { eligible: true, delivery, employeeEmail: normalized };
  }

  /**
   * Builds RFC 2822 / MIME multipart raw email message with PDF attachment.
   */
  buildRawEmail(params: {
    from: string;
    to: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    pdfBuffer: Buffer;
    pdfFilename: string;
  }): Buffer {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const altBoundary = `----=_Part_Alt_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    const lines: string[] = [
      `From: ${params.from}`,
      `To: ${params.to}`,
      `Subject: =?UTF-8?B?${Buffer.from(params.subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(params.bodyText).toString('base64'),
      '',
      `--${altBoundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(params.bodyHtml).toString('base64'),
      '',
      `--${altBoundary}--`,
      '',
      `--${boundary}`,
      `Content-Type: application/pdf; name="${params.pdfFilename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${params.pdfFilename}"`,
      '',
      params.pdfBuffer.toString('base64'),
      '',
      `--${boundary}--`,
    ];

    return Buffer.from(lines.join('\r\n'));
  }

  /**
   * Executes a send attempt for a given delivery.
   */
  async sendDelivery(
    deliveryId: string,
    trigger: PayslipDeliveryAttemptTrigger = PayslipDeliveryAttemptTrigger.AUTOMATIC,
    triggeredByHrOfficerId?: string,
  ): Promise<SendPayslipEmailResult> {
    const attemptNumberRecord = await this.prisma.payslipDelivery.update({
      where: { id: deliveryId },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        status: PayslipDeliveryStatus.PROCESSING,
      },
      select: {
        attemptCount: true,
      },
    });

    const attemptNumber = attemptNumberRecord.attemptCount;
    const startedAt = new Date();

    const attempt = await this.prisma.payslipDeliveryAttempt.create({
      data: {
        deliveryId,
        attemptNumber,
        trigger,
        triggeredByHrOfficerId,
        startedAt,
      },
    });

    const eligibility = await this.checkEligibility(deliveryId);
    if (!eligibility.eligible || !eligibility.delivery || !eligibility.employeeEmail) {
      const outcome = PayslipDeliveryAttemptOutcome.CONFIRMED_FAILURE;
      const errorCode = eligibility.reason?.includes('suppressed') ? 'SUPPRESSED_ADDRESS' : 'VALIDATION_FAILED';
      const errorMessage = eligibility.reason || 'Not eligible for send';

      await this.prisma.payslipDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          finishedAt: new Date(),
          outcome,
          errorCode,
          errorMessage,
        },
      });

      await this.prisma.payslipDelivery.update({
        where: { id: deliveryId },
        data: {
          status: errorCode === 'SUPPRESSED_ADDRESS' ? PayslipDeliveryStatus.FAILED : PayslipDeliveryStatus.SKIPPED,
          skipReason: errorMessage,
          lastErrorCode: errorCode,
          lastErrorMessage: errorMessage,
        },
      });

      return { outcome, errorCode, errorMessage };
    }

    const { delivery, employeeEmail } = eligibility;

    // Get PDF from reader
    const pdfResult = await this.pdfReader.getReady(delivery.payslipId);
    if (pdfResult.status !== 'READY') {
      const outcome = PayslipDeliveryAttemptOutcome.CONFIRMED_FAILURE;
      const errorCode = 'PDF_NOT_READY';
      const errorMessage = `Payslip PDF is not ready (status: ${pdfResult.status}).`;

      await this.prisma.payslipDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          finishedAt: new Date(),
          outcome,
          errorCode,
          errorMessage,
        },
      });

      await this.prisma.payslipDelivery.update({
        where: { id: deliveryId },
        data: {
          status: PayslipDeliveryStatus.RETRY_SCHEDULED,
          nextAttemptAt: new Date(Date.now() + 60 * 1000), // Retry in 1 min
          lastErrorCode: errorCode,
          lastErrorMessage: errorMessage,
        },
      });

      return { outcome, errorCode, errorMessage };
    }

    if (!this.sesClient) {
      const outcome = PayslipDeliveryAttemptOutcome.CONFIRMED_FAILURE;
      const errorCode = 'SES_NOT_CONFIGURED';
      const errorMessage = 'AWS SES credentials are not configured.';

      await this.prisma.payslipDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          finishedAt: new Date(),
          outcome,
          errorCode,
          errorMessage,
        },
      });

      await this.prisma.payslipDelivery.update({
        where: { id: deliveryId },
        data: {
          status: PayslipDeliveryStatus.FAILED,
          lastErrorCode: errorCode,
          lastErrorMessage: errorMessage,
        },
      });

      return { outcome, errorCode, errorMessage };
    }

    const fromAddress = this.configService.get<string>('SES_FROM_ADDRESS') || process.env.SES_FROM_ADDRESS || 'payslips@example.com';
    const periodName = delivery.payslip.payslipBatch.payrollPeriod.name;
    const companyName = delivery.payslip.payslipBatch.accountingCompany.name;
    const subject = `Your Payslip for ${periodName} - ${companyName}`;
    const employeeName = delivery.employee?.fullName || 'Employee';

    const bodyText = `Dear ${employeeName},\n\nPlease find attached your payslip for ${periodName} (${companyName}).\n\nKind regards,\nHR Department`;
    const bodyHtml = `<p>Dear ${employeeName},</p><p>Please find attached your payslip for <strong>${periodName}</strong> (${companyName}).</p><p>Kind regards,<br>HR Department</p>`;
    const pdfFilename = `payslip-${periodName.replace(/\s+/g, '_')}.pdf`;

    const rawMime = this.buildRawEmail({
      from: fromAddress,
      to: employeeEmail,
      subject,
      bodyText,
      bodyHtml,
      pdfBuffer: pdfResult.bytes,
      pdfFilename,
    });

    await this.acquireToken();

    try {
      const command = new SendRawEmailCommand({
        RawMessage: {
          Data: rawMime,
        },
      });

      const response = await this.sesClient.send(command);
      const sesMessageId = response.MessageId;

      await this.prisma.payslipDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          finishedAt: new Date(),
          outcome: PayslipDeliveryAttemptOutcome.ACCEPTED,
          sesMessageId,
        },
      });

      await this.prisma.payslipDelivery.update({
        where: { id: deliveryId },
        data: {
          status: PayslipDeliveryStatus.SUBMITTED,
          sesMessageId,
          submittedAt: new Date(),
          recipientEmailSnapshot: employeeEmail,
          recipientMasked: maskEmail(employeeEmail),
          contentHash: delivery.payslip.contentHash,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });

      return { outcome: PayslipDeliveryAttemptOutcome.ACCEPTED, sesMessageId };
    } catch (err: any) {
      const message = err?.message || String(err);
      this.logger.error(`SES SendRawEmail failed for delivery ${deliveryId}: ${message}`);

      // Check for transient / unknown timeout error vs permanent error
      const isTransient = message.includes('Timeout') || message.includes('ECONNRESET') || message.includes('Rate');
      const outcome = isTransient
        ? PayslipDeliveryAttemptOutcome.SUBMISSION_UNKNOWN
        : PayslipDeliveryAttemptOutcome.CONFIRMED_FAILURE;

      const errorCode = message.includes('sandbox')
        ? 'SES_SANDBOX'
        : message.includes('Authentication')
        ? 'SES_AUTH_FAILED'
        : 'SEND_FAILED';

      await this.prisma.payslipDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          finishedAt: new Date(),
          outcome,
          errorCode,
          errorMessage: message.slice(0, 500),
        },
      });

      await this.prisma.payslipDelivery.update({
        where: { id: deliveryId },
        data: {
          status: outcome === PayslipDeliveryAttemptOutcome.SUBMISSION_UNKNOWN
            ? PayslipDeliveryStatus.SUBMISSION_UNKNOWN
            : PayslipDeliveryStatus.FAILED,
          lastErrorCode: errorCode,
          lastErrorMessage: message.slice(0, 500),
        },
      });

      return { outcome, errorCode, errorMessage: message };
    }
  }
}
