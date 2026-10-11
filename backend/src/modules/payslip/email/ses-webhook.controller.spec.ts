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
});
