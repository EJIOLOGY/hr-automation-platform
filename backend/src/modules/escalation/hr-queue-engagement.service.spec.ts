import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EscalationService } from './escalation.service';
import { HrQueueEngagementService, QUEUE_ENGAGEMENT_PREFIX } from './hr-queue-engagement.service';
import { EscalationStatus, MessageDirection, MessageType } from '../../generated/prisma/enums';

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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HrQueueEngagementService,
        { provide: PrismaService, useValue: prisma },
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
        employee: { fullName: 'Ejiro Example' },
      },
    ]);
    prisma.chatMessage.findFirst.mockResolvedValue(null);

    const sent = await service.processWaitingEscalations(
      new Date('2026-08-20T10:04:59.000Z'),
    );

    expect(sent).toBe(0);
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it('sends the first waiting message after five minutes', async () => {
    const createdAt = new Date('2026-08-20T10:00:00.000Z');

    prisma.escalation.findMany.mockResolvedValue([
      {
        id: 'esc-1',
        sessionId: 'session-1',
        createdAt,
        employee: { fullName: 'Ejiro Example' },
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
        employee: { fullName: 'Ejiro Example' },
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
        employee: { fullName: 'Ejiro Example' },
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
        employee: { fullName: 'Ejiro Example' },
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
    expect(prisma.chatMessage.create).toHaveBeenCalled();
  });

  it('does not process escalations that are already in progress', async () => {
    prisma.escalation.findMany.mockResolvedValue([]);

    const sent = await service.processWaitingEscalations(
      new Date('2026-08-20T11:00:00.000Z'),
    );

    expect(sent).toBe(0);
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it('uses the queue position in the first waiting message', async () => {
    const createdAt = new Date('2026-08-20T10:00:00.000Z');

    prisma.escalation.findMany.mockResolvedValue([
      {
        id: 'esc-2',
        sessionId: 'session-2',
        createdAt,
        employee: { fullName: 'Ejiro Example' },
      },
    ]);
    prisma.chatMessage.findFirst.mockResolvedValue(null);
    prisma.chatMessage.count.mockResolvedValue(0);
    prisma.escalation.count.mockResolvedValue(3);
    prisma.chatMessage.create.mockResolvedValue({ id: 'msg-1' });

    await service.processWaitingEscalations(
      new Date('2026-08-20T10:05:00.000Z'),
    );

    expect(prisma.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: expect.stringContaining('number 4 in the HR queue'),
        }),
      }),
    );
  });
});

describe('EscalationService', () => {
  let service: EscalationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscalationService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = module.get<EscalationService>(EscalationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
