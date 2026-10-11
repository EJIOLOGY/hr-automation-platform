import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SESv2Client,
  GetAccountCommand,
  GetEmailIdentityCommand,
} from '@aws-sdk/client-sesv2';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { HrOfficerRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';

export interface SesStatusResponse {
  region: string;
  productionAccessEnabled: boolean;
  sendingEnabled: boolean;
  max24HourSend: number;
  sentLast24Hours: number;
  maxSendRate: number;
  effectiveSendRate: number;
  identity: {
    domain: string;
    verified: boolean;
    dkim: string;
    mailFrom: string;
  };
  configurationSet: string;
  snsTopicConfigured: boolean;
  lastEventReceivedAt: string | null;
  circuitBreaker: {
    open: boolean;
  };
  stale?: boolean;
}

@Controller('payslip')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SesStatusController {
  private sesClient: SESv2Client | null = null;
  private cachedStatus: { response: SesStatusResponse; cachedAt: number } | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const region = this.configService.get<string>('AWS_REGION') || process.env.AWS_REGION || 'eu-west-1';
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID') || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || process.env.AWS_SECRET_ACCESS_KEY;

    if (accessKeyId && secretAccessKey) {
      this.sesClient = new SESv2Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  /**
   * GET /payslip/ses-status
   * Returns live/cached status for SES, quotas, domain identity, and circuit breaker.
   */
  @Get('ses-status')
  @Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
  async getSesStatus(): Promise<SesStatusResponse> {
    const now = Date.now();
    if (this.cachedStatus && now - this.cachedStatus.cachedAt < 60 * 1000) {
      return this.cachedStatus.response;
    }

    const region = this.configService.get<string>('AWS_REGION') || process.env.AWS_REGION || 'eu-west-1';
    const sendingDomain = this.configService.get<string>('SES_SENDING_DOMAIN') || 'intertechsystemslimited.com';
    const configurationSet = this.configService.get<string>('SES_CONFIGURATION_SET') || 'payslip-delivery';
    const snsTopicArn = this.configService.get<string>('SES_SNS_TOPIC_ARN') || process.env.SES_SNS_TOPIC_ARN;
    const configuredRate = Number(this.configService.get<string>('SES_SEND_RATE_PER_SECOND') || 1);

    try {
      let prodAccess = false;
      let sendingEnabled = true;
      let max24 = 200;
      let sent24 = 0;
      let maxRate = 1;
      let dkimStatus = 'UNKNOWN';
      let mailFromStatus = 'UNKNOWN';
      let verifiedStatus = false;

      if (this.sesClient) {
        const account = await this.sesClient.send(new GetAccountCommand({}));
        prodAccess = Boolean(account.ProductionAccessEnabled);
        sendingEnabled = Boolean(account.SendingEnabled ?? true);
        max24 = account.SendQuota?.Max24HourSend || 200;
        sent24 = account.SendQuota?.SentLast24Hours || 0;
        maxRate = account.SendQuota?.MaxSendRate || 1;

        try {
          const identity = await this.sesClient.send(
            new GetEmailIdentityCommand({ EmailIdentity: sendingDomain }),
          );
          verifiedStatus = Boolean(identity.VerifiedForSendingStatus);
          dkimStatus = identity.DkimAttributes?.Status || 'UNKNOWN';
          mailFromStatus = identity.MailFromAttributes?.MailFromDomainStatus || 'UNKNOWN';
        } catch {
          // domain identity call may fail if domain is not added yet
        }
      }

      // Check last SES notification event
      const lastEvent = await this.prisma.sesNotificationEvent.findFirst({
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      });

      // Check if any active dispatch has CIRCUIT_BREAKER pauseReason
      const activePausedCb = await this.prisma.payslipEmailDispatch.findFirst({
        where: {
          status: 'PAUSED',
          pauseReason: 'CIRCUIT_BREAKER',
        },
      });

      const response: SesStatusResponse = {
        region,
        productionAccessEnabled: prodAccess,
        sendingEnabled,
        max24HourSend: max24,
        sentLast24Hours: sent24,
        maxSendRate: maxRate,
        effectiveSendRate: Math.min(configuredRate, maxRate),
        identity: {
          domain: sendingDomain,
          verified: verifiedStatus,
          dkim: dkimStatus,
          mailFrom: mailFromStatus,
        },
        configurationSet,
        snsTopicConfigured: Boolean(snsTopicArn),
        lastEventReceivedAt: lastEvent ? lastEvent.receivedAt.toISOString() : null,
        circuitBreaker: {
          open: Boolean(activePausedCb),
        },
      };

      this.cachedStatus = { response, cachedAt: now };
      return response;
    } catch (err) {
      if (this.cachedStatus) {
        return {
          ...this.cachedStatus.response,
          stale: true,
        };
      }

      return {
        region,
        productionAccessEnabled: false,
        sendingEnabled: false,
        max24HourSend: 0,
        sentLast24Hours: 0,
        maxSendRate: 0,
        effectiveSendRate: configuredRate,
        identity: {
          domain: sendingDomain,
          verified: false,
          dkim: 'ERROR',
          mailFrom: 'ERROR',
        },
        configurationSet,
        snsTopicConfigured: Boolean(snsTopicArn),
        lastEventReceivedAt: null,
        circuitBreaker: { open: false },
        stale: true,
      };
    }
  }
}
