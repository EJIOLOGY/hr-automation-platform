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
import type { Prisma } from '../../../generated/prisma/client';
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

    if (!expectedTopicArn) {
      // Fail closed: without a configured topic we cannot tell our SNS topic from anyone else's.
      this.logger.error('SES_SNS_TOPIC_ARN is not configured; rejecting SNS message.');
      throw new ForbiddenException('SES_SNS_TOPIC_ARN is not configured');
    }
    if (rawMessage.TopicArn !== expectedTopicArn) {
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
   * SNS posts JSON text with Content-Type text/plain (parsed to a string by the text body parser
   * registered in main.ts). JSON bodies and raw Buffers are also accepted for tests and proxies.
   */
  parseSnsBody(req: Request & { rawBody?: Buffer }): any {
    const body: unknown = req.body;
    try {
      if (typeof body === 'string' && body.trim().length > 0) {
        return JSON.parse(body);
      }
      if (Buffer.isBuffer(body)) {
        return JSON.parse(body.toString('utf-8'));
      }
      if (body && typeof body === 'object' && Object.keys(body as object).length > 0) {
        return body;
      }
      if (req.rawBody && Buffer.isBuffer(req.rawBody) && req.rawBody.length > 0) {
        return JSON.parse(req.rawBody.toString('utf-8'));
      }
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }
    throw new BadRequestException('Empty SNS payload');
  }

  /**
   * Keeps only what the event mapper needs. Recipient addresses (mail.destination,
   * bounce.bouncedRecipients, complaint.complainedRecipients, ...) are deliberately dropped so
   * full email addresses are never persisted in the event log.
   */
  buildMinimalPayload(event: any): Record<string, unknown> {
    const tags = event?.mail?.tags ?? {};
    const safeTags: Record<string, unknown> = {};
    for (const key of ['deliveryId', 'dispatchId']) {
      if (tags[key] !== undefined) safeTags[key] = tags[key];
    }
    return {
      eventType: event?.eventType ?? event?.notificationType ?? 'Unknown',
      mail: {
        messageId: event?.mail?.messageId,
        timestamp: event?.mail?.timestamp,
        tags: safeTags,
      },
      ...(event?.bounce
        ? {
            bounce: {
              bounceType: event.bounce.bounceType,
              bounceSubType: event.bounce.bounceSubType,
              timestamp: event.bounce.timestamp,
            },
          }
        : {}),
      ...(event?.complaint
        ? {
            complaint: {
              complaintFeedbackType: event.complaint.complaintFeedbackType,
              timestamp: event.complaint.timestamp,
            },
          }
        : {}),
      ...(event?.delivery ? { delivery: { timestamp: event.delivery.timestamp } } : {}),
      ...(event?.deliveryDelay
        ? { deliveryDelay: { delayType: event.deliveryDelay.delayType, timestamp: event.deliveryDelay.timestamp } }
        : {}),
      ...(event?.reject ? { reject: { reason: event.reject.reason } } : {}),
      ...(event?.failure ? { failure: { errorMessage: event.failure.errorMessage } } : {}),
    };
  }

  /**
   * POST /webhooks/ses-events
   * Unauthenticated endpoint receiving SNS notifications for SES events.
   */
  @Post('ses-events')
  @HttpCode(HttpStatus.OK)
  async handleSesEvent(@Req() req: Request & { rawBody?: Buffer }) {
    const parsedMessage = this.parseSnsBody(req);

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
        const request = https
          .get(subscribeUrl, (res) => {
            res.resume();
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(new Error(`Subscription confirmation returned HTTP ${res.statusCode}`));
            }
          })
          .on('error', reject);
        request.setTimeout(10000, () => request.destroy(new Error('Subscription confirmation timed out')));
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
            minimalPayload: this.buildMinimalPayload(innerEvent) as Prisma.InputJsonValue,
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
