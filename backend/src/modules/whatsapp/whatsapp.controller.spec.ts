import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappGraphClient } from './whatsapp-graph-client.service';

describe('WhatsappController', () => {
  let controller: WhatsappController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        {
          provide: WhatsappService,
          useValue: {
            handleInbound: jest.fn(),
          },
        },
        {
          provide: WhatsappGraphClient,
          useValue: {
            sendMessages: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<WhatsappController>(WhatsappController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('verifyWebhook', () => {
    it('returns the challenge when the verification token is valid', () => {
      const configService = {
        get: jest.fn().mockReturnValue('test-verify-token'),
      };

      const testController = new WhatsappController(
        { handleInbound: jest.fn() } as any,
        { sendMessages: jest.fn() } as any,
        configService as any,
      );

      expect(
        testController.verifyWebhook(
          'subscribe',
          'test-verify-token',
          'challenge-123',
        ),
      ).toBe('challenge-123');
    });

    it('rejects an invalid verification token', () => {
      const configService = {
        get: jest.fn().mockReturnValue('test-verify-token'),
      };

      const testController = new WhatsappController(
        { handleInbound: jest.fn() } as any,
        { sendMessages: jest.fn() } as any,
        configService as any,
      );

      expect(() =>
        testController.verifyWebhook(
          'subscribe',
          'wrong-token',
          'challenge-123',
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('receiveWebhook', () => {
    const buildMetaPayload = (message: unknown) => ({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_ID',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '2347050773130',
                  phone_number_id: 'PHONE_NUMBER_ID',
                },
                messages: [message],
              },
            },
          ],
        },
      ],
    });

    it('unwraps the Meta webhook envelope and passes the inbound message to the service', async () => {
      const handleInbound = jest.fn().mockResolvedValue([]);
      const sendMessages = jest.fn();

      const testController = new WhatsappController(
        { handleInbound } as any,
        { sendMessages } as any,
        { get: jest.fn() } as any,
      );

      const message = {
        from: '2348000000000',
        id: 'wamid.TEST123',
        timestamp: '1757410000',
        type: 'text',
        text: { body: 'Hello' },
      };

      const result = await testController.receiveWebhook(
        buildMetaPayload(message),
      );

      expect(handleInbound).toHaveBeenCalledTimes(1);
      expect(handleInbound).toHaveBeenCalledWith(message);
      expect(result).toEqual({ received: true });
    });

    it('sends computed replies back to the sender via the Graph client', async () => {
      const replies = [{ type: 'text', text: 'Hi there' }];
      const handleInbound = jest.fn().mockResolvedValue(replies);
      const sendMessages = jest.fn();

      const testController = new WhatsappController(
        { handleInbound } as any,
        { sendMessages } as any,
        { get: jest.fn() } as any,
      );

      const message = {
        from: '2348000000000',
        id: 'wamid.TEST123',
        timestamp: '1757410000',
        type: 'text',
        text: { body: 'Hello' },
      };

      await testController.receiveWebhook(buildMetaPayload(message));

      expect(sendMessages).toHaveBeenCalledTimes(1);
      expect(sendMessages).toHaveBeenCalledWith('2348000000000', replies);
    });

    it('does not attempt to send when there are no replies', async () => {
      const handleInbound = jest.fn().mockResolvedValue([]);
      const sendMessages = jest.fn();

      const testController = new WhatsappController(
        { handleInbound } as any,
        { sendMessages } as any,
        { get: jest.fn() } as any,
      );

      const message = {
        from: '2348000000000',
        id: 'wamid.TEST123',
        timestamp: '1757410000',
        type: 'text',
        text: { body: 'Hello' },
      };

      await testController.receiveWebhook(buildMetaPayload(message));

      expect(sendMessages).not.toHaveBeenCalled();
    });

    it('safely ignores unsupported webhook payloads (e.g. status/delivery events)', async () => {
      const handleInbound = jest.fn();
      const sendMessages = jest.fn();

      const testController = new WhatsappController(
        { handleInbound } as any,
        { sendMessages } as any,
        { get: jest.fn() } as any,
      );

      const result = await testController.receiveWebhook({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA_ID',
            changes: [{ field: 'messages', value: { statuses: [] } }],
          },
        ],
      });

      expect(handleInbound).not.toHaveBeenCalled();
      expect(sendMessages).not.toHaveBeenCalled();
      expect(result).toEqual({ received: true });
    });

    it('safely ignores malformed or unrelated payloads', async () => {
      const handleInbound = jest.fn();
      const sendMessages = jest.fn();

      const testController = new WhatsappController(
        { handleInbound } as any,
        { sendMessages } as any,
        { get: jest.fn() } as any,
      );

      const result = await testController.receiveWebhook({ foo: 'bar' });

      expect(handleInbound).not.toHaveBeenCalled();
      expect(sendMessages).not.toHaveBeenCalled();
      expect(result).toEqual({ received: true });
    });
  });
});
