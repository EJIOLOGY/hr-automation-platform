import { Test, TestingModule } from '@nestjs/testing';
import { SesWebhookController } from './ses-webhook.controller';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { SesEventMapperService } from './ses-event-mapper.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('SesWebhookController & Event Mapping', () => {
  let controller: SesWebhookController;
  let prisma: any;
  let mapper: any;

  beforeEach(async () => {
    prisma = {
      sesNotificationEvent: {
        create: jest.fn(),
      },
    };

    mapper = {
      processEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SesWebhookController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: SesEventMapperService, useValue: mapper },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((k: string) => {
              if (k === 'SES_SNS_TOPIC_ARN') return 'arn:aws:sns:eu-west-1:123456789012:test-topic';
              return null;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<SesWebhookController>(SesWebhookController);
  });

  describe('SNS security validation', () => {
    it('rejects with 403 if SigningCertURL host does not match sns.<region>.amazonaws.com', async () => {
      const invalidMsg = {
        TopicArn: 'arn:aws:sns:eu-west-1:123456789012:test-topic',
        SigningCertURL: 'https://evil.com/cert.pem',
        Timestamp: new Date().toISOString(),
      };

      await expect(controller.validateSnsMessage(invalidMsg)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects with 403 if TopicArn does not match configured topic', async () => {
      const invalidMsg = {
        TopicArn: 'arn:aws:sns:eu-west-1:123456789012:wrong-topic',
        SigningCertURL: 'https://sns.eu-west-1.amazonaws.com/cert.pem',
        Timestamp: new Date().toISOString(),
      };

      await expect(controller.validateSnsMessage(invalidMsg)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects with 403 if message timestamp is older than 1 hour', async () => {
      const oldTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const oldMsg = {
        TopicArn: 'arn:aws:sns:eu-west-1:123456789012:test-topic',
        SigningCertURL: 'https://sns.eu-west-1.amazonaws.com/cert.pem',
        Timestamp: oldTimestamp,
      };

      await expect(controller.validateSnsMessage(oldMsg)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('Idempotent event receipt', () => {
    it('returns DuplicateEventIgnored if snsMessageId was already inserted (P2002)', async () => {
      // Mock signature validation to pass
      jest.spyOn(controller, 'validateSnsMessage').mockResolvedValue(undefined);

      prisma.sesNotificationEvent.create.mockRejectedValue({ code: 'P2002' });

      const payload = {
        Type: 'Notification',
        MessageId: 'duplicate-sns-id',
        Message: JSON.stringify({
          eventType: 'Delivery',
          mail: { messageId: 'ses-1' },
        }),
      };

      const res = await controller.handleSesEvent({
        body: payload,
      } as any);

      expect(res).toEqual({ status: 'DuplicateEventIgnored' });
    });
  });
  describe('SNS body handling (text/plain)', () => {
    it('parses a JSON string body, as delivered by SNS with Content-Type text/plain', () => {
      const msg = { Type: 'Notification', MessageId: 'm-1', Message: '{}' };
      const parsed = controller.parseSnsBody({ body: JSON.stringify(msg) } as any);
      expect(parsed.MessageId).toBe('m-1');
    });

    it('parses a Buffer body and falls back to rawBody when body is empty', () => {
      const msg = { Type: 'Notification', MessageId: 'm-2' };
      expect(controller.parseSnsBody({ body: Buffer.from(JSON.stringify(msg)) } as any).MessageId).toBe('m-2');
      expect(
        controller.parseSnsBody({ body: {}, rawBody: Buffer.from(JSON.stringify(msg)) } as any).MessageId,
      ).toBe('m-2');
    });

    it('rejects an empty or malformed body with 400', () => {
      expect(() => controller.parseSnsBody({ body: {} } as any)).toThrow(BadRequestException);
      expect(() => controller.parseSnsBody({ body: '{not json' } as any)).toThrow(BadRequestException);
    });

    it('handles a full text/plain notification end to end and stores no recipient addresses', async () => {
      jest.spyOn(controller, 'validateSnsMessage').mockResolvedValue(undefined);
      prisma.sesNotificationEvent.create.mockResolvedValue({ id: 'evt-1' });

      const sesEvent = {
        eventType: 'Bounce',
        mail: {
          messageId: 'ses-9',
          timestamp: '2026-10-11T10:00:00.000Z',
          destination: ['jane.doe@example.invalid'],
          tags: { deliveryId: ['d-1'], other: ['x'] },
        },
        bounce: {
          bounceType: 'Permanent',
          bounceSubType: 'General',
          bouncedRecipients: [{ emailAddress: 'jane.doe@example.invalid' }],
        },
      };
      const body = JSON.stringify({ Type: 'Notification', MessageId: 'sns-9', Message: JSON.stringify(sesEvent) });

      const res = await controller.handleSesEvent({ body } as any);

      expect(res).toEqual({ status: 'EventReceived', id: 'evt-1' });
      const stored = prisma.sesNotificationEvent.create.mock.calls[0][0].data.minimalPayload;
      expect(JSON.stringify(stored)).not.toContain('jane.doe');
      expect(stored.bounce.bounceType).toBe('Permanent');
      expect(stored.mail.tags).toEqual({ deliveryId: ['d-1'] });
    });
  });

  describe('Topic configuration', () => {
    it('fails closed when SES_SNS_TOPIC_ARN is not configured', async () => {
      const configService = (controller as any).configService;
      configService.get.mockReturnValue(undefined);
      const saved = process.env.SES_SNS_TOPIC_ARN;
      delete process.env.SES_SNS_TOPIC_ARN;
      try {
        await expect(
          controller.validateSnsMessage({
            TopicArn: 'arn:aws:sns:eu-west-1:123456789012:any',
            SigningCertURL: 'https://sns.eu-west-1.amazonaws.com/cert.pem',
            Timestamp: new Date().toISOString(),
          }),
        ).rejects.toThrow(ForbiddenException);
      } finally {
        if (saved !== undefined) process.env.SES_SNS_TOPIC_ARN = saved;
      }
    });
  });
});
