import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SESv2Client,
  SendEmailCommand,
  GetAccountCommand,
  GetEmailIdentityCommand,
  GetSuppressedDestinationCommand,
} from '@aws-sdk/client-sesv2';
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

export type SendOutcome =
  | { kind: 'ACCEPTED'; sesMessageId: string }
  | { kind: 'TRANSIENT'; code: string }
  | { kind: 'PERMANENT'; code: string }
  | { kind: 'SUPPRESSED'; code: string }
  | { kind: 'ACCOUNT_PAUSED'; code: string }
  | { kind: 'CONFIG_ERROR'; code: string }
  | { kind: 'UNKNOWN'; code: string };

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeHeader(str: string): string {
  return str.replace(/[\r\n]+/g, ' ').trim();
}

@Injectable()
export class PayslipEmailSenderService {
  private readonly logger = new Logger(PayslipEmailSenderService.name);
  private sesClient: SESv2Client | null = null;
  private isConfigured: boolean = false;

  private configuredSendRate: number = 1;
  private effectiveSendRate: number = 1;
  private tokens: number = 1;
  private lastRefill: number = Date.now();
  private lastAccountCheck: number = 0;

  // Identity verification cache (10 min)
  private verifiedIdentitiesCache: Map<string, { verified: boolean; cachedAt: number }> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly pdfReader: PayslipPdfReader,
  ) {
    const region = this.configService.get<string>('AWS_REGION') || process.env.AWS_REGION || 'eu-west-1';
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID') || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || process.env.AWS_SECRET_ACCESS_KEY;
    const rateEnv = this.configService.get<string>('SES_SEND_RATE_PER_SECOND') || process.env.SES_SEND_RATE_PER_SECOND;
    this.configuredSendRate = rateEnv ? Number(rateEnv) || 1 : 1;
    this.effectiveSendRate = this.configuredSendRate;
    this.tokens = this.effectiveSendRate;

    if (accessKeyId && secretAccessKey) {
      this.sesClient = new SESv2Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.isConfigured = true;
    } else {
      this.isConfigured = false;
      this.logger.warn('AWS SES credentials are not fully configured. Live sends will result in CONFIG_ERROR.');
    }
  }

  getIsConfigured(): boolean {
    return this.isConfigured;
  }

  getEffectiveSendRate(): number {
    return this.effectiveSendRate;
  }

  /**
   * Refills token bucket and limits to effective rate.
   */
  async acquireToken(): Promise<void> {
    await this.refreshAccountRateIfDue();

    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.effectiveSendRate, this.tokens + elapsed * this.effectiveSendRate);
    this.lastRefill = now;

    if (this.tokens < 1) {
      const waitMs = Math.ceil(((1 - this.tokens) / this.effectiveSendRate) * 1000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.acquireToken();
    }
    this.tokens -= 1;
  }

  /**
   * At startup and every 15 minutes, calls GetAccount and caps effective rate at min(configured, MaxSendRate).
   */
  async refreshAccountRateIfDue(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastAccountCheck < 15 * 60 * 1000) {
      return;
    }
    this.lastAccountCheck = now;

    if (!this.sesClient) return;

    try {
      const res = await this.sesClient.send(new GetAccountCommand({}));
      const maxRate = res.SendQuota?.MaxSendRate;
      if (maxRate && maxRate > 0) {
        this.effectiveSendRate = Math.min(this.configuredSendRate, maxRate);
      } else {
        this.effectiveSendRate = this.configuredSendRate;
      }
    } catch (err: any) {
      this.logger.warn(`Could not fetch SES account quota: ${err?.message || err}`);
      this.effectiveSendRate = this.configuredSendRate;
    }
  }

  /**
   * Checks whether the account has production access enabled.
   */
  async isProductionAccessEnabled(): Promise<boolean> {
    if (!this.sesClient) return false;
    try {
      const res = await this.sesClient.send(new GetAccountCommand({}));
      return Boolean(res.ProductionAccessEnabled);
    } catch (err) {
      return false;
    }
  }

  /**
   * Checks whether an email address is a verified identity in SES (cached for 10 minutes).
   */
  async isRecipientVerifiedInSandbox(email: string): Promise<boolean> {
    if (!this.sesClient) return false;
    const normalized = normalizeEmail(email);
    const cached = this.verifiedIdentitiesCache.get(normalized);
    const now = Date.now();
    if (cached && now - cached.cachedAt < 10 * 60 * 1000) {
      return cached.verified;
    }

    try {
      const res = await this.sesClient.send(new GetEmailIdentityCommand({ EmailIdentity: normalized }));
      const verified = Boolean(res.VerifiedForSendingStatus);
      this.verifiedIdentitiesCache.set(normalized, { verified, cachedAt: now });
      return verified;
    } catch {
      this.verifiedIdentitiesCache.set(normalized, { verified: false, cachedAt: now });
      return false;
    }
  }

  /**
   * Classify SES / SDK error by error name and $metadata.
   */
  classifySesError(err: any): SendOutcome {
    if (!err) {
      return { kind: 'UNKNOWN', code: 'UNKNOWN' };
    }

    const name = err.name || '';
    const httpStatus = err.$metadata?.httpStatusCode;
    const msg = String(err.message || '');

    // 1. Transient throttles
    if (
      name === 'TooManyRequestsException' ||
      name === 'ThrottlingException' ||
      httpStatus === 429 ||
      httpStatus === 503
    ) {
      return { kind: 'TRANSIENT', code: name || 'THROTTLED' };
    }

    if (name === 'LimitExceededException') {
      return { kind: 'TRANSIENT', code: 'LIMIT_EXCEEDED' };
    }

    // 2. Sandbox / unverified recipient
    if (name === 'MessageRejected') {
      if (
        msg.toLowerCase().includes('not verified') ||
        msg.toLowerCase().includes('sandbox') ||
        msg.toLowerCase().includes('unverified')
      ) {
        return { kind: 'PERMANENT', code: 'SANDBOX_RECIPIENT_NOT_VERIFIED' };
      }
      return { kind: 'PERMANENT', code: 'MESSAGE_REJECTED' };
    }

    if (name === 'BadRequestException' || name === 'InvalidParameterValue') {
      return { kind: 'PERMANENT', code: name };
    }

    // 3. Config error
    if (
      name === 'MailFromDomainNotVerifiedException' ||
      name === 'NotFoundException' ||
      name === 'CredentialsProviderError' ||
      name === 'UnrecognizedClientException' ||
      name === 'InvalidSignatureException' ||
      name === 'AccessDeniedException'
    ) {
      return { kind: 'CONFIG_ERROR', code: name };
    }

    // 4. Account paused
    if (name === 'AccountSuspendedException' || name === 'SendingPausedException') {
      return { kind: 'ACCOUNT_PAUSED', code: name };
    }

    // 5. Network timeouts / unknown after possible send
    if (
      name === 'TimeoutError' ||
      msg.includes('ECONNRESET') ||
      msg.includes('EPIPE') ||
      msg.includes('socket hang up') ||
      msg.includes('ETIMEDOUT') ||
      (httpStatus && httpStatus >= 500 && httpStatus !== 503)
    ) {
      return { kind: 'UNKNOWN', code: name || 'NETWORK_UNKNOWN' };
    }

    return { kind: 'UNKNOWN', code: name || 'UNKNOWN_ERROR' };
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
   * Executes a send attempt for a given delivery.
   */
  async sendDelivery(
    deliveryId: string,
    trigger: PayslipDeliveryAttemptTrigger = PayslipDeliveryAttemptTrigger.AUTOMATIC,
    triggeredByHrOfficerId?: string,
  ): Promise<SendOutcome> {
    const fromAddress = this.configService.get<string>('PAYSLIP_FROM_EMAIL') || process.env.PAYSLIP_FROM_EMAIL;
    if (!fromAddress) {
      return { kind: 'CONFIG_ERROR', code: 'PAYSLIP_FROM_EMAIL_NOT_CONFIGURED' };
    }

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
      const isSuppressed = eligibility.reason?.includes('suppressed');
      const errorCode = isSuppressed ? 'SUPPRESSED_ADDRESS' : 'VALIDATION_FAILED';
      const errorMessage = eligibility.reason || 'Not eligible for send';

      await this.prisma.payslipDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          finishedAt: new Date(),
          outcome: PayslipDeliveryAttemptOutcome.CONFIRMED_FAILURE,
          errorCode,
          errorMessage,
        },
      });

      await this.prisma.payslipDelivery.update({
        where: { id: deliveryId },
        data: {
          status: isSuppressed ? PayslipDeliveryStatus.FAILED : PayslipDeliveryStatus.SKIPPED,
          skipReason: errorMessage,
          lastErrorCode: errorCode,
          lastErrorMessage: errorMessage,
        },
      });

      return isSuppressed ? { kind: 'SUPPRESSED', code: errorCode } : { kind: 'PERMANENT', code: errorCode };
    }

    const { delivery, employeeEmail } = eligibility;

    // Get PDF from reader
    const pdfResult = await this.pdfReader.getReady(delivery.payslipId);
    if (pdfResult.status !== 'READY') {
      const errorCode = 'PDF_NOT_READY';
      const errorMessage = `Payslip PDF is not ready (status: ${pdfResult.status}).`;

      // Per A2.3: if non-READY at send time, pause dispatch, leave delivery PENDING, delete attempt row
      if (delivery.dispatchId) {
        await this.prisma.payslipEmailDispatch.update({
          where: { id: delivery.dispatchId },
          data: {
            status: 'PAUSED',
            pauseReason: 'PDF_INVARIANT_BROKEN',
          },
        });
      }

      await this.prisma.payslipDeliveryAttempt.delete({
        where: { id: attempt.id },
      });

      await this.prisma.payslipDelivery.update({
        where: { id: deliveryId },
        data: {
          status: PayslipDeliveryStatus.PENDING,
          attemptCount: { decrement: 1 },
          lastErrorCode: errorCode,
          lastErrorMessage: errorMessage,
        },
      });

      return { kind: 'CONFIG_ERROR', code: 'PDF_INVARIANT_BROKEN' };
    }

    if (!this.sesClient) {
      const errorCode = 'SES_NOT_CONFIGURED';
      const errorMessage = 'AWS SES credentials are not configured.';

      await this.prisma.payslipDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          finishedAt: new Date(),
          outcome: PayslipDeliveryAttemptOutcome.CONFIRMED_FAILURE,
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

      return { kind: 'CONFIG_ERROR', code: errorCode };
    }

    const configSetName = this.configService.get<string>('SES_CONFIGURATION_SET') || process.env.SES_CONFIGURATION_SET || 'payslip-delivery';
    const periodName = delivery.payslip.payslipBatch.payrollPeriod.name;
    const companyName = delivery.payslip.payslipBatch.accountingCompany.name;
    const subject = sanitizeHeader(`Your Payslip for ${periodName} - ${companyName}`);
    const employeeName = delivery.employee?.fullName || 'Employee';

    const safeEmployeeName = escapeHtml(employeeName);
    const safePeriodName = escapeHtml(periodName);
    const safeCompanyName = escapeHtml(companyName);

    const bodyText = `Dear ${employeeName},\n\nPlease find attached your payslip for ${periodName} (${companyName}).\n\nKind regards,\nHR Department`;
    const bodyHtml = `<p>Dear ${safeEmployeeName},</p><p>Please find attached your payslip for <strong>${safePeriodName}</strong> (${safeCompanyName}).</p><p>Kind regards,<br>HR Department</p>`;
    const pdfFilename = sanitizeHeader(`payslip-${periodName.replace(/\s+/g, '_')}.pdf`);

    await this.acquireToken();

    try {
      const emailTags = [
        { Name: 'deliveryId', Value: delivery.id },
      ];
      if (delivery.dispatchId) {
        emailTags.push({ Name: 'dispatchId', Value: delivery.dispatchId });
      }

      const command = new SendEmailCommand({
        FromEmailAddress: fromAddress,
        Destination: {
          ToAddresses: [employeeEmail],
        },
        ConfigurationSetName: configSetName,
        EmailTags: emailTags,
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: {
              Text: { Data: bodyText, Charset: 'UTF-8' },
              Html: { Data: bodyHtml, Charset: 'UTF-8' },
            },
            Attachments: [
              {
                FileName: pdfFilename,
                RawContent: pdfResult.bytes,
                ContentType: 'application/pdf',
                ContentDisposition: 'ATTACHMENT',
              },
            ],
          },
        },
      });

      const response = await this.sesClient.send(command);
      const sesMessageId = response.MessageId || 'unknown-ses-id';

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

      return { kind: 'ACCEPTED', sesMessageId };
    } catch (err: any) {
      const outcome = this.classifySesError(err);
      const message = String(err?.message || '').slice(0, 500);
      this.logger.error(`SES SendEmailCommand failed for delivery ${deliveryId} [${outcome.kind}]: ${message}`);

      const attemptOutcome =
        outcome.kind === 'UNKNOWN'
          ? PayslipDeliveryAttemptOutcome.SUBMISSION_UNKNOWN
          : PayslipDeliveryAttemptOutcome.CONFIRMED_FAILURE;

      const errorCode = outcome.kind !== 'ACCEPTED' ? outcome.code : 'UNKNOWN';

      await this.prisma.payslipDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          finishedAt: new Date(),
          outcome: attemptOutcome,
          errorCode,
          errorMessage: message,
        },
      });

      let nextStatus: PayslipDeliveryStatus;
      if (outcome.kind === 'UNKNOWN') {
        nextStatus = PayslipDeliveryStatus.SUBMISSION_UNKNOWN;
      } else if (outcome.kind === 'ACCOUNT_PAUSED' || outcome.kind === 'CONFIG_ERROR') {
        nextStatus = PayslipDeliveryStatus.PENDING;
        // Pause dispatch if present
        if (delivery.dispatchId) {
          await this.prisma.payslipEmailDispatch.update({
            where: { id: delivery.dispatchId },
            data: {
              status: 'PAUSED',
              pauseReason: outcome.kind,
            },
          });
        }
      } else if (outcome.kind === 'TRANSIENT') {
        nextStatus = PayslipDeliveryStatus.RETRY_SCHEDULED;
      } else {
        nextStatus = PayslipDeliveryStatus.FAILED;
      }

      await this.prisma.payslipDelivery.update({
        where: { id: deliveryId },
        data: {
          status: nextStatus,
          lastErrorCode: errorCode,
          lastErrorMessage: message,
        },
      });

      return outcome;
    }
  }
}
