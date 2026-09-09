import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

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
        {
          handleInbound: jest.fn(),
        } as any,
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
        {
          handleInbound: jest.fn(),
        } as any,
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
    it('passes incoming WhatsApp messages to the service', async () => {
      const handleInbound = jest.fn().mockResolvedValue([]);

      const testController = new WhatsappController(
        {
          handleInbound,
        } as any,
        {
          get: jest.fn(),
        } as any,
      );

      const message = {
        from: '2348000000000',
        id: 'wamid.TEST123',
        timestamp: '1757410000',
        type: 'text',
        text: {
          body: 'Hello',
        },
      };

      const result = await testController.receiveWebhook({
        messages: [message],
      });

      expect(handleInbound).toHaveBeenCalledTimes(1);
      expect(handleInbound).toHaveBeenCalledWith(message);
      expect(result).toEqual({ received: true });
    });

    it('safely ignores unsupported webhook payloads', async () => {
      const handleInbound = jest.fn();

      const testController = new WhatsappController(
        {
          handleInbound,
        } as any,
        {
          get: jest.fn(),
        } as any,
      );

      const result = await testController.receiveWebhook({
        statuses: [],
      });

      expect(handleInbound).not.toHaveBeenCalled();
      expect(result).toEqual({ received: true });
    });
  });
});
