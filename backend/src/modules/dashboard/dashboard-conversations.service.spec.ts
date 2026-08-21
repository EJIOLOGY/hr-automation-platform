import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../core/prisma/prisma.service';
import { EscalationStatus } from '../../generated/prisma/enums';
import { DashboardConversationsService } from './dashboard-conversations.service';

describe('DashboardConversationsService', () => {
  let service: DashboardConversationsService;

  const prisma = {
    chatSession: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    chatMessage: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardConversationsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<DashboardConversationsService>(
      DashboardConversationsService,
    );
  });

  it('returns dashboard conversation summaries', async () => {
    const lastActivityAt = new Date('2026-08-21T10:00:00.000Z');

    prisma.chatSession.findMany.mockResolvedValue([
      {
        id: 'session-1',
        currentState: 'HR_QUEUE',
        isActive: true,
        startedAt: new Date('2026-08-21T09:00:00.000Z'),
        lastActivityAt,
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
          },
        ],
      },
    ]);

    const result = await service.listConversations();

    expect(result.items).toHaveLength(1);

    expect(result.items[0]).toMatchObject({
      id: 'session-1',
      employee: {
        employeeNumber: 'EMP001',
        fullName: 'Test Employee',
      },
      currentState: 'HR_QUEUE',
      isActive: true,
      activeEscalation: {
        id: 'escalation-1',
        status: EscalationStatus.OPEN,
      },
    });

    expect(result.pagination.hasNextPage).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
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

  it('rejects an unknown conversation', async () => {
    prisma.chatSession.findUnique.mockResolvedValue(null);

    await expect(service.getMessages('missing-session')).rejects.toThrow(
      'Conversation not found.',
    );
  });

  it('rejects an invalid cursor', async () => {
    await expect(
      service.listConversations(25, 'invalid-cursor'),
    ).rejects.toThrow('Invalid pagination cursor.');
  });
});
