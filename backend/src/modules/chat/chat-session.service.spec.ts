import { ChatSessionService } from './chat-session.service';

describe('ChatSessionService', () => {
  let service: ChatSessionService;
  let prisma: {
    chatSession: {
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      chatSession: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    service = new ChatSessionService(prisma as never);
  });

  it('returns the active session when it has been inactive for less than 24 hours', async () => {
    const session = {
      id: 'session-1',
      employeeId: 'employee-1',
      currentState: 'LEAVE_MENU',
      isActive: true,
      lastActivityAt: new Date(Date.now() - 23 * 60 * 60 * 1000),
    };

    prisma.chatSession.findFirst.mockResolvedValue(session);

    await expect(
      service.getOrCreateSession('employee-1', 'MAIN_MENU'),
    ).resolves.toBe(session);

    expect(prisma.chatSession.update).not.toHaveBeenCalled();
    expect(prisma.chatSession.create).not.toHaveBeenCalled();
  });

  it('closes an active session at or beyond 24 hours of inactivity and creates a new main-menu session', async () => {
    const expiredSession = {
      id: 'session-1',
      employeeId: 'employee-1',
      currentState: 'LEAVE_MENU',
      isActive: true,
      lastActivityAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    };

    const newSession = {
      id: 'session-2',
      employeeId: 'employee-1',
      currentState: 'MAIN_MENU',
      isActive: true,
    };

    prisma.chatSession.findFirst.mockResolvedValue(expiredSession);
    prisma.chatSession.update.mockResolvedValue({
      ...expiredSession,
      isActive: false,
    });
    prisma.chatSession.create.mockResolvedValue(newSession);

    await expect(
      service.getOrCreateSession('employee-1', 'MAIN_MENU'),
    ).resolves.toBe(newSession);

    expect(prisma.chatSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        isActive: false,
        endedAt: expect.any(Date),
        lastActivityAt: expect.any(Date),
      }),
    });

    expect(prisma.chatSession.create).toHaveBeenCalledWith({
      data: {
        employeeId: 'employee-1',
        currentState: 'MAIN_MENU',
      },
    });
  });

  it('creates a new session when no active session exists', async () => {
    const newSession = {
      id: 'session-1',
      employeeId: 'employee-1',
      currentState: 'MAIN_MENU',
      isActive: true,
    };

    prisma.chatSession.findFirst.mockResolvedValue(null);
    prisma.chatSession.create.mockResolvedValue(newSession);

    await expect(
      service.getOrCreateSession('employee-1', 'MAIN_MENU'),
    ).resolves.toBe(newSession);

    expect(prisma.chatSession.update).not.toHaveBeenCalled();
    expect(prisma.chatSession.create).toHaveBeenCalledWith({
      data: {
        employeeId: 'employee-1',
        currentState: 'MAIN_MENU',
      },
    });
  });
});
