import { createHmac } from 'crypto';
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappGraphClient } from './whatsapp-graph-client.service';

describe('WhatsappController', () => {
  let controller: WhatsappController;

  const appSecret = 'test-app-secret';

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

    const buildSignedRequest = (payload: unknown) => {
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = `sha256=${createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex')}`;

      return {
        rawBody,
        header: jest.fn().mockReturnValue(signature),
      };
    };

    const buildController = (
      handleInbound: jest.Mock,
      sendMessages: jest.Mock,
    ) =>
      new WhatsappController(
        { handleInbound } as any,
        { sendMessages } as any,
        {
          get: jest.fn().mockReturnValue(appSecret),
        } as any,
      );

    it('unwraps the Meta webhook envelope and passes the inbound message to the service', async () => {
      const handleInbound = jest.fn().mockResolvedValue([]);
      const sendMessages = jest.fn();

      const testController = buildController(handleInbound, sendMessages);

      const message = {
        from: '2348000000000',
        id: 'wamid.TEST123',
        timestamp: '1757410000',
        type: 'text',
        text: { body: 'Hello' },
      };

      const payload = buildMetaPayload(message);
      const request = buildSignedRequest(payload);

      const result = await testController.receiveWebhook(
        request as any,
        payload,
      );

      expect(handleInbound).toHaveBeenCalledTimes(1);
      expect(handleInbound).toHaveBeenCalledWith(message);
      expect(result).toEqual({ received: true });
    });

    it('sends computed replies back to the sender via the Graph client', async () => {
      const replies = [{ type: 'text', text: 'Hi there' }];
      const handleInbound = jest.fn().mockResolvedValue(replies);
      const sendMessages = jest.fn();

      const testController = buildController(handleInbound, sendMessages);

      const message = {
        from: '2348000000000',
        id: 'wamid.TEST123',
        timestamp: '1757410000',
        type: 'text',
        text: { body: 'Hello' },
      };

      const payload = buildMetaPayload(message);
      const request = buildSignedRequest(payload);

      await testController.receiveWebhook(request as any, payload);

      expect(sendMessages).toHaveBeenCalledTimes(1);
      expect(sendMessages).toHaveBeenCalledWith('2348000000000', replies);
    });

    it('does not attempt to send when there are no replies', async () => {
      const handleInbound = jest.fn().mockResolvedValue([]);
      const sendMessages = jest.fn();

      const testController = buildController(handleInbound, sendMessages);

      const message = {
        from: '2348000000000',
        id: 'wamid.TEST123',
        timestamp: '1757410000',
        type: 'text',
        text: { body: 'Hello' },
      };

      const payload = buildMetaPayload(message);
      const request = buildSignedRequest(payload);

      await testController.receiveWebhook(request as any, payload);

      expect(sendMessages).not.toHaveBeenCalled();
    });

    it('safely ignores unsupported webhook payloads (e.g. status/delivery events)', async () => {
      const handleInbound = jest.fn();
      const sendMessages = jest.fn();

      const testController = buildController(handleInbound, sendMessages);

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA_ID',
            changes: [{ field: 'messages', value: { statuses: [] } }],
          },
        ],
      };

      const request = buildSignedRequest(payload);

      const result = await testController.receiveWebhook(
        request as any,
        payload,
      );

      expect(handleInbound).not.toHaveBeenCalled();
      expect(sendMessages).not.toHaveBeenCalled();
      expect(result).toEqual({ received: true });
    });

    it('safely ignores malformed or unrelated payloads', async () => {
      const handleInbound = jest.fn();
      const sendMessages = jest.fn();

      const testController = buildController(handleInbound, sendMessages);

      const payload = { foo: 'bar' };
      const request = buildSignedRequest(payload);

      const result = await testController.receiveWebhook(
        request as any,
        payload,
      );

      expect(handleInbound).not.toHaveBeenCalled();
      expect(sendMessages).not.toHaveBeenCalled();
      expect(result).toEqual({ received: true });
    });

    it('rejects webhook requests without a signature', async () => {
      const handleInbound = jest.fn();
      const sendMessages = jest.fn();

      const testController = buildController(handleInbound, sendMessages);

      const payload = { foo: 'bar' };
      const rawBody = Buffer.from(JSON.stringify(payload));

      const request = {
        rawBody,
        header: jest.fn().mockReturnValue(undefined),
      };

      await expect(
        testController.receiveWebhook(request as any, payload),
      ).rejects.toThrow(ForbiddenException);

      expect(handleInbound).not.toHaveBeenCalled();
      expect(sendMessages).not.toHaveBeenCalled();
    });

    it('rejects webhook requests with an invalid signature', async () => {
      const handleInbound = jest.fn();
      const sendMessages = jest.fn();

      const testController = buildController(handleInbound, sendMessages);

      const payload = { foo: 'bar' };
      const rawBody = Buffer.from(JSON.stringify(payload));

      const request = {
        rawBody,
        header: jest.fn().mockReturnValue('sha256=invalid-signature'),
      };

      await expect(
        testController.receiveWebhook(request as any, payload),
      ).rejects.toThrow(ForbiddenException);

      expect(handleInbound).not.toHaveBeenCalled();
      expect(sendMessages).not.toHaveBeenCalled();
    });

    it('rejects webhook requests when the app secret is not configured', async () => {
      const handleInbound = jest.fn();
      const sendMessages = jest.fn();

      const testController = new WhatsappController(
        { handleInbound } as any,
        { sendMessages } as any,
        {
          get: jest.fn().mockReturnValue(undefined),
        } as any,
      );

      const payload = { foo: 'bar' };
      const request = buildSignedRequest(payload);

      await expect(
        testController.receiveWebhook(request as any, payload),
      ).rejects.toThrow(ForbiddenException);

      expect(handleInbound).not.toHaveBeenCalled();
      expect(sendMessages).not.toHaveBeenCalled();
    });

    it('rejects webhook requests when the raw body is unavailable', async () => {
      const handleInbound = jest.fn();
      const sendMessages = jest.fn();

      const testController = buildController(handleInbound, sendMessages);

      const payload = { foo: 'bar' };

      const request = {
        header: jest.fn().mockReturnValue('sha256=some-signature'),
      };

      await expect(
        testController.receiveWebhook(request as any, payload),
      ).rejects.toThrow(ForbiddenException);

      expect(handleInbound).not.toHaveBeenCalled();
      expect(sendMessages).not.toHaveBeenCalled();
    });
  });
});
