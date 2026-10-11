import {
  BadRequestException,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import MessageValidator from 'sns-validator';
import https from 'https';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SesEventMapperService } from './ses-event-mapper.service';

@Controller('webhooks')
export class SesWebhookController {
  private readonly logger = new Logger(SesWebhookController.name);
  private readonly validator = new MessageValidator();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mapper: SesEventMapperService,
  ) {}

  /**
   * Validates SNS message signature, cert URL host, age, and topic ARN.
   */
  async validateSnsMessage(rawMessage: any): Promise<void> {
    const expectedTopicArn =
      this.configService.get<string>('SES_SNS_TOPIC_ARN') || process.env.SES_SNS_TOPIC_ARN;

    if (expectedTopicArn && rawMessage.TopicArn && rawMessage.TopicArn !== expectedTopicArn) {
      throw new ForbiddenException('TopicArn mismatch');
    }

    // Host must match sns.<region>.amazonaws.com over HTTPS
    const certUrl = rawMessage.SigningCertURL;
    if (!certUrl) {
      throw new ForbiddenException('Missing SigningCertURL');
    }

    try {
      const parsedUrl = new URL(certUrl);
      if (
        parsedUrl.protocol !== 'https:' ||
        !/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(parsedUrl.hostname)
      ) {
        throw new ForbiddenException('Invalid SigningCertURL host');
      }
    } catch {
      throw new ForbiddenException('Malformed SigningCertURL');
    }

    // Message must not be older than 1 hour
    if (rawMessage.Timestamp) {
      const messageAgeMs = Date.now() - new Date(rawMessage.Timestamp).getTime();
      if (messageAgeMs > 60 * 60 * 1000) {
        throw new ForbiddenException('Message timestamp is older than 1 hour');
      }
    }

    // Cryptographic signature verification via sns-validator
    await new Promise<void>((resolve, reject) => {
      this.validator.validate(rawMessage, (err) => {
        if (err) {
          reject(new ForbiddenException(`Invalid SNS signature: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * POST /webhooks/ses-events
   * Unauthenticated endpoint receiving SNS notifications for SES events.
   */
  @Post('ses-events')
  @HttpCode(HttpStatus.OK)
  async handleSesEvent(@Req() req: Request & { rawBody?: Buffer }) {
    let rawBodyStr = '';
    if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
      rawBodyStr = req.rawBody.toString('utf-8');
    } else if (typeof req.body === 'string') {
      rawBodyStr = req.body;
    } else if (req.body && typeof req.body === 'object') {
      rawBodyStr = JSON.stringify(req.body);
    }

    let parsedMessage: any;
    try {
      parsedMessage = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(rawBodyStr);
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    await this.validateSnsMessage(parsedMessage);

    const messageType = parsedMessage.Type;

    // 1. SubscriptionConfirmation
    if (messageType === 'SubscriptionConfirmation') {
      const subscribeUrl = parsedMessage.SubscribeURL;
      if (!subscribeUrl) {
        throw new BadRequestException('Missing SubscribeURL');
      }

      const parsedSub = new URL(subscribeUrl);
      if (
        parsedSub.protocol !== 'https:' ||
        !/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(parsedSub.hostname)
      ) {
        throw new ForbiddenException('Invalid SubscribeURL host');
      }

      this.logger.log(`Confirming SNS subscription via ${subscribeUrl}`);
      await new Promise<void>((resolve, reject) => {
        https
          .get(subscribeUrl, (res) => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(new Error(`Subscription confirmation returned HTTP ${res.statusCode}`));
            }
          })
          .on('error', reject);
      });

      return { status: 'SubscriptionConfirmed' };
    }

    // 2. UnsubscribeConfirmation
    if (messageType === 'UnsubscribeConfirmation') {
      this.logger.warn(`Received UnsubscribeConfirmation for topic ${parsedMessage.TopicArn}`);
      return { status: 'Unsubscribed' };
    }

    // 3. Notification
    if (messageType === 'Notification') {
      const snsMessageId = parsedMessage.MessageId;
      let innerEvent: any;
      try {
        innerEvent =
          typeof parsedMessage.Message === 'object'
            ? parsedMessage.Message
            : JSON.parse(parsedMessage.Message);
      } catch {
        throw new BadRequestException('Invalid inner SES event JSON in Message field');
      }

      const eventType = innerEvent.eventType || innerEvent.notificationType || 'Unknown';
      const sesMessageId = innerEvent.mail?.messageId;
      const eventTimestamp = innerEvent.mail?.timestamp ? new Date(innerEvent.mail.timestamp) : new Date();

      // Idempotent insertion
      let eventRecord: any;
      try {
        eventRecord = await this.prisma.sesNotificationEvent.create({
          data: {
            snsMessageId,
            eventType,
            sesMessageId,
            eventTimestamp,
            minimalPayload: innerEvent,
          },
        });
      } catch (err: any) {
        // P2002 duplicate unique key -> idempotent 200 OK
        if (err?.code === 'P2002') {
          return { status: 'DuplicateEventIgnored' };
        }
        throw err;
      }

      // Process event asynchronously/fast
      void this.mapper.processEvent(eventRecord.id).catch((err) => {
        this.logger.error(`Error processing SES event ${eventRecord.id}: ${err?.message || err}`);
      });

      return { status: 'EventReceived', id: eventRecord.id };
    }

    return { status: 'IgnoredMessageType' };
  }
}
