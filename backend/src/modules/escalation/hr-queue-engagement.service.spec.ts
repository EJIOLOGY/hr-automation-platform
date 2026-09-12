import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';

import { PrismaService } from '../../core/prisma/prisma.service';
import { EscalationService } from './escalation.service';
import {
  HrQueueEngagementService,
  QUEUE_ENGAGEMENT_PREFIX,
} from './hr-queue-engagement.service';
import {
  EscalationStatus,
  MessageDirection,
  MessageType,
} from '../../generated/prisma/enums';

describe('HrQueueEngagementService', () => {
  let service: HrQueueEngagementService;

  const prisma = {
    escalation: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    chatMessage: {
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
  };

  const httpService = {
    post: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        WHATSAPP_ACCESS_TOKEN: 'test-access-token',
        WHATSAPP_PHONE_NUMBER_ID: 'test-phone-number-id',
        WHATSAPP_GRAPH_API_VERSION: 'v21.0',
      };

      return values[key];
    }),
  };

  const employee = {
    fullName: 'Ejiro Example',
    phoneNumber: '08000000000',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    httpService.post.mockReturnValue(of({ data: {} }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HrQueueEngagementService,
        { provide: PrismaService, useValue: prisma },
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<HrQueueEngagementService>(HrQueueEngagementService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('does not send a waiting message before five minutes', async () => {
    const createdAt = new Date('2026-08-20T10:00:00.000Z');

    prisma.escalation.findMany.mockResolvedValue([
      {
        id: 'esc-1',
        sessionId: 'session-1',
        createdAt,
        employee,
      },
    ]);
    prisma.chatMessage.findFirst.mockResolvedValue(null);

    const sent = await service.processWaitingEscalations(
      new Date('2026-08-20T10:04:59.000Z'),
    );

    expect(sent).toBe(0);
    expect(httpService.post).not.toHaveBeenCalled();
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it('sends the first waiting message after five minutes', async () => {
    const createdAt = new Date('2026-08-20T10:00:00.000Z');

    prisma.escalation.findMany.mockResolvedValue([
      {
        id: 'esc-1',
        sessionId: 'session-1',
        createdAt,
        employee,
      },
    ]);
    prisma.chatMessage.findFirst.mockResolvedValue(null);
    prisma.chatMessage.count.mockResolvedValue(0);
    prisma.escalation.count.mockResolvedValue(1);
    prisma.chatMessage.create.mockResolvedValue({ id: 'msg-1' });

    const sent = await service.processWaitingEscalations(
      new Date('2026-08-20T10:05:00.000Z'),
    );

    expect(sent).toBe(1);
    expect(httpService.post).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/test-phone-number-id/messages',
      expect.objectContaining({
        messaging_product: 'whatsapp',
        to: '2348000000000',
        type: 'text',
        text: {
          body: expect.stringContaining('number 2 in the HR queue'),
        },
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'session-1',
        direction: MessageDirection.OUTBOUND,
        messageType: MessageType.TEXT,
        content: expect.stringContaining(QUEUE_ENGAGEMENT_PREFIX),
      }),
    });
  });

  it('sends the second waiting message fifteen minutes after queue entry', async () => {
    const createdAt = new Date('2026-08-20T10:00:00.000Z');
    const lastEngagementAt = new Date('2026-08-20T10:05:00.000Z');

    prisma.escalation.findMany.mockResolvedValue([
      {
        id: 'esc-1',
        sessionId: 'session-1',
        createdAt,
        employee,
      },
    ]);
    prisma.chatMessage.findFirst.mockResolvedValue({
      createdAt: lastEngagementAt,
    });
    prisma.chatMessage.count.mockResolvedValue(1);
    prisma.escalation.count.mockResolvedValue(1);
    prisma.chatMessage.create.mockResolvedValue({ id: 'msg-2' });

    const sent = await service.processWaitingEscalations(
      new Date('2026-08-20T10:15:00.000Z'),
    );

    expect(sent).toBe(1);
    expect(httpService.post).toHaveBeenCalled();
    expect(prisma.chatMessage.create).toHaveBeenCalled();
  });

  it('does not send another periodic message before thirty minutes after the previous engagement', async () => {
    const createdAt = new Date('2026-08-20T10:00:00.000Z');
    const lastEngagementAt = new Date('2026-08-20T10:15:00.000Z');

    prisma.escalation.findMany.mockResolvedValue([
      {
        id: 'esc-1',
        sessionId: 'session-1',
        createdAt,
        employee,
      },
    ]);
    prisma.chatMessage.findFirst.mockResolvedValue({
      createdAt: lastEngagementAt,
    });
    prisma.chatMessage.count.mockResolvedValue(2);

    const sent = await service.processWaitingEscalations(
      new Date('2026-08-20T10:44:59.000Z'),
    );

    expect(sent).toBe(0);
    expect(httpService.post).not.toHaveBeenCalled();
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it('sends a periodic waiting update thirty minutes after the previous engagement', async () => {
    const createdAt = new Date('2026-08-20T10:00:00.000Z');
    const lastEngagementAt = new Date('2026-08-20T10:15:00.000Z');

    prisma.escalation.findMany.mockResolvedValue([
      {
        id: 'esc-1',
        sessionId: 'session-1',
        createdAt,
        employee,
      },
    ]);
    prisma.chatMessage.findFirst.mockResolvedValue({
      createdAt: lastEngagementAt,
    });
    prisma.chatMessage.count.mockResolvedValue(2);
    prisma.escalation.count.mockResolvedValue(1);
    prisma.chatMessage.create.mockResolvedValue({ id: 'msg-3' });

    const sent = await service.processWaitingEscalations(
      new Date('2026-08-20T10:45:00.000Z'),
    );

    expect(sent).toBe(1);
    expect(httpService.post).toHaveBeenCalled();
    expect(prisma.chatMessage.create).toHaveBeenCalled();
  });

  it('does not process escalations that are already in progress', async () => {
    prisma.escalation.findMany.mockResolvedValue([]);

    const sent = await service.processWaitingEscalations(
      new Date('2026-08-20T11:00:00.000Z'),
    );

    expect(sent).toBe(0);
    expect(httpService.post).not.toHaveBeenCalled();
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it('uses the queue position in the first waiting message', async () => {
    const createdAt = new Date('2026-08-20T10:00:00.000Z');

    prisma.escalation.findMany.mockResolvedValue([
      {
        id: 'esc-2',
        sessionId: 'session-2',
        createdAt,
        employee,
      },
    ]);
    prisma.chatMessage.findFirst.mockResolvedValue(null);
    prisma.chatMessage.count.mockResolvedValue(0);
    prisma.escalation.count.mockResolvedValue(3);
    prisma.chatMessage.create.mockResolvedValue({ id: 'msg-1' });

    await service.processWaitingEscalations(
      new Date('2026-08-20T10:05:00.000Z'),
    );

    expect(httpService.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: {
          body: expect.stringContaining('number 4 in the HR queue'),
        },
      }),
      expect.any(Object),
    );
  });

  it('does not persist the engagement message when WhatsApp delivery fails', async () => {
    const createdAt = new Date('2026-08-20T10:00:00.000Z');

    prisma.escalation.findMany.mockResolvedValue([
      {
        id: 'esc-1',
        sessionId: 'session-1',
        createdAt,
        employee,
      },
    ]);
    prisma.chatMessage.findFirst.mockResolvedValue(null);
    prisma.chatMessage.count.mockResolvedValue(0);
    prisma.escalation.count.mockResolvedValue(1);

    httpService.post.mockReturnValueOnce(
      throwError(() => new Error('WhatsApp unavailable')),
    );

    const sent = await service.processWaitingEscalations(
      new Date('2026-08-20T10:05:00.000Z'),
    );

    expect(sent).toBe(0);
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });
});

describe('EscalationService', () => {
  let service: EscalationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EscalationService, { provide: PrismaService, useValue: {} }],
    }).compile();

    service = module.get<EscalationService>(EscalationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
