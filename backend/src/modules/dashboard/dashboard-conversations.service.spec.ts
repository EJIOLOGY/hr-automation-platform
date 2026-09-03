import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../core/prisma/prisma.service';
import { EscalationStatus } from '../../generated/prisma/enums';
import { AuditService } from '../audit/audit.service';
import { DashboardConversationsService } from './dashboard-conversations.service';

describe('DashboardConversationsService', () => {
  let service: DashboardConversationsService;

  const prisma = {
    chatSession: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    chatMessage: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const auditService = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        chatMessage: prisma.chatMessage,
        chatSession: prisma.chatSession,
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardConversationsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: AuditService,
          useValue: auditService,
        },
      ],
    }).compile();

    service = module.get<DashboardConversationsService>(
      DashboardConversationsService,
    );
  });

  it('returns dashboard conversation summaries including HR read state', async () => {
    const lastActivityAt = new Date('2026-08-21T10:00:00.000Z');
    const lastReadByHrAt = new Date('2026-08-21T09:59:00.000Z');

    prisma.chatSession.findMany.mockResolvedValue([
      {
        id: 'session-1',
        currentState: 'HR_QUEUE',
        isActive: true,
        startedAt: new Date('2026-08-21T09:00:00.000Z'),
        lastActivityAt,
        lastReadByHrAt,
        endedAt: null,
        employee: {
          id: 'employee-1',
          employeeNumber: 'EMP001',
          fullName: 'Test Employee',
          phoneNumber: '08000000000',
          department: 'Engineering',
          jobTitle: 'Engineer',
          status: 'ACTIVE',
        },
        messages: [
          {
            id: 'message-1',
            direction: 'INBOUND',
            messageType: 'TEXT',
            content: 'I need help.',
            sentByHrOfficerId: null,
            createdAt: new Date('2026-08-21T10:00:00.000Z'),
          },
        ],
        escalations: [
          {
            id: 'escalation-1',
            reason: 'Employee needs HR assistance.',
            status: EscalationStatus.OPEN,
            category: null,
            documentType: null,
            createdAt: new Date('2026-08-21T09:59:00.000Z'),
            assignedHrOfficerId: null,
          },
        ],
      },
    ]);

    const result = await service.listConversations();

    expect(result.items[0]).toMatchObject({
      id: 'session-1',
      lastReadByHrAt,
      activeEscalation: {
        id: 'escalation-1',
        status: EscalationStatus.OPEN,
      },
    });
  });

  it('returns a paginated conversation message thread', async () => {
    prisma.chatSession.findUnique.mockResolvedValue({
      id: 'session-1',
    });

    prisma.chatMessage.findMany.mockResolvedValue([
      {
        id: 'message-2',
        direction: 'OUTBOUND',
        messageType: 'TEXT',
        content: 'How may I help you?',
        sentByHrOfficerId: 'officer-1',
        sentByHrOfficer: {
          id: 'officer-1',
          fullName: 'HR Officer',
          email: 'hr@example.com',
          role: 'OFFICER',
        },
        createdAt: new Date('2026-08-21T10:02:00.000Z'),
      },
      {
        id: 'message-1',
        direction: 'INBOUND',
        messageType: 'TEXT',
        content: 'I need help.',
        sentByHrOfficerId: null,
        sentByHrOfficer: null,
        createdAt: new Date('2026-08-21T10:01:00.000Z'),
      },
    ]);

    const result = await service.getMessages('session-1');

    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe('message-1');
    expect(result.items[1].id).toBe('message-2');
    expect(result.items[1].sentByHrOfficerId).toBe('officer-1');
    expect(result.pagination.hasNextPage).toBe(false);
  });

  it('sends an HR reply for the officer assigned to the active escalation', async () => {
    prisma.chatSession.findUnique.mockResolvedValue({
      id: 'session-1',
      isActive: true,
      escalations: [
        {
          id: 'escalation-1',
          assignedHrOfficerId: 'officer-1',
          status: EscalationStatus.IN_PROGRESS,
        },
      ],
    });

    const createdAt = new Date('2026-08-21T10:05:00.000Z');

    prisma.chatMessage.create.mockResolvedValue({
      id: 'message-3',
      sessionId: 'session-1',
      direction: 'OUTBOUND',
      messageType: 'TEXT',
      content: 'Your request has been received.',
      sentByHrOfficerId: 'officer-1',
      createdAt,
    });

    prisma.chatSession.update.mockResolvedValue({
      id: 'session-1',
      lastActivityAt: createdAt,
    });

    auditService.log.mockResolvedValue({ id: 'audit-1' });

    const result = await service.replyToConversation(
      'session-1',
      'officer-1',
      '  Your request has been received.  ',
    );

    expect(result).toMatchObject({
      id: 'message-3',
      content: 'Your request has been received.',
      sentByHrOfficerId: 'officer-1',
    });

    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        direction: 'OUTBOUND',
        messageType: 'TEXT',
        content: 'Your request has been received.',
        sentByHrOfficerId: 'officer-1',
      },
      select: {
        id: true,
        sessionId: true,
        direction: true,
        messageType: true,
        content: true,
        sentByHrOfficerId: true,
        createdAt: true,
      },
    });

    expect(prisma.chatSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { lastActivityAt: expect.any(Date) },
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'HR_OFFICER',
        actorHrOfficerId: 'officer-1',
        action: 'HR_MESSAGE_SENT',
        entityType: 'CHAT_MESSAGE',
        entityId: 'message-3',
        metadata: {
          sessionId: 'session-1',
          escalationId: 'escalation-1',
        },
      }),
    );
  });

  it('rejects an HR reply when the conversation has no active assigned escalation', async () => {
    prisma.chatSession.findUnique.mockResolvedValue({
      id: 'session-1',
      isActive: true,
      escalations: [],
    });

    await expect(
      service.replyToConversation('session-1', 'officer-1', 'Hello'),
    ).rejects.toThrow(
      'This conversation is not currently assigned to an HR officer.',
    );
  });

  it('rejects an HR reply from an officer who is not assigned to the conversation', async () => {
    prisma.chatSession.findUnique.mockResolvedValue({
      id: 'session-1',
      isActive: true,
      escalations: [
        {
          id: 'escalation-1',
          assignedHrOfficerId: 'officer-2',
          status: EscalationStatus.IN_PROGRESS,
        },
      ],
    });

    await expect(
      service.replyToConversation('session-1', 'officer-1', 'Hello'),
    ).rejects.toThrow('This conversation is assigned to another HR officer.');
  });

  it('rejects an empty HR reply', async () => {
    await expect(
      service.replyToConversation('session-1', 'officer-1', '   '),
    ).rejects.toThrow('Message content cannot be empty.');

    expect(prisma.chatSession.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an unknown conversation when replying', async () => {
    prisma.chatSession.findUnique.mockResolvedValue(null);

    await expect(
      service.replyToConversation('missing-session', 'officer-1', 'Hello'),
    ).rejects.toThrow('Conversation not found.');
  });

  it('marks a conversation as read and audits the action', async () => {
    prisma.chatSession.findUnique.mockResolvedValue({
      id: 'session-1',
    });

    const readAt = new Date('2026-08-21T10:06:00.000Z');

    prisma.chatSession.update.mockResolvedValue({
      id: 'session-1',
      lastReadByHrAt: readAt,
    });

    auditService.log.mockResolvedValue({ id: 'audit-2' });

    const result = await service.markConversationRead('session-1', 'officer-1');

    expect(result).toEqual({
      id: 'session-1',
      lastReadByHrAt: readAt,
    });

    expect(prisma.chatSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { lastReadByHrAt: expect.any(Date) },
      select: {
        id: true,
        lastReadByHrAt: true,
      },
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'HR_OFFICER',
        actorHrOfficerId: 'officer-1',
        action: 'CONVERSATION_READ',
        entityType: 'CHAT_SESSION',
        entityId: 'session-1',
      }),
    );
  });

  it('rejects marking an unknown conversation as read', async () => {
    prisma.chatSession.findUnique.mockResolvedValue(null);

    await expect(
      service.markConversationRead('missing-session', 'officer-1'),
    ).rejects.toThrow('Conversation not found.');
  });

  it('rejects an invalid cursor', async () => {
    await expect(
      service.listConversations(25, 'invalid-cursor'),
    ).rejects.toThrow('Invalid pagination cursor.');
  });
});
