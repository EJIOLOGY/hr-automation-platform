jest.mock('../../core/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

import { AnalyticsService } from './analytics.service';
import { AnalyticsEventType } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: {
    analyticsEvent: {
      create: jest.Mock;
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      analyticsEvent: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => {
        return cb(prisma);
      }),
    };

    service = new AnalyticsService(prisma as unknown as PrismaService);
  });

  describe('recordEvent', () => {
    it('creates an analytics event directly', async () => {
      await service.recordEvent({
        type: AnalyticsEventType.SESSION_STARTED,
        sessionId: 'session-1',
        employeeId: 'emp-1',
      });

      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
        data: {
          type: AnalyticsEventType.SESSION_STARTED,
          sessionId: 'session-1',
          employeeId: 'emp-1',
          escalationId: undefined,
          metadata: undefined,
        },
      });
    });
  });

  describe('recordBotCompleted', () => {
    it('creates BOT_COMPLETED event when none exists for the session', async () => {
      prisma.analyticsEvent.findFirst.mockResolvedValue(null);
      prisma.analyticsEvent.create.mockResolvedValue({ id: 'event-1' });

      await service.recordBotCompleted({
        sessionId: 'session-1',
        employeeId: 'emp-1',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.analyticsEvent.findFirst).toHaveBeenCalledWith({
        where: {
          sessionId: 'session-1',
          type: AnalyticsEventType.BOT_COMPLETED,
        },
        select: { id: true },
      });
      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
        data: {
          type: AnalyticsEventType.BOT_COMPLETED,
          sessionId: 'session-1',
          employeeId: 'emp-1',
        },
      });
    });

    it('does not create BOT_COMPLETED event if one already exists for the session (deduplication)', async () => {
      prisma.analyticsEvent.findFirst.mockResolvedValue({
        id: 'existing-event',
      });

      await service.recordBotCompleted({
        sessionId: 'session-1',
        employeeId: 'emp-1',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.analyticsEvent.findFirst).toHaveBeenCalledWith({
        where: {
          sessionId: 'session-1',
          type: AnalyticsEventType.BOT_COMPLETED,
        },
        select: { id: true },
      });
      expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
    });
  });
});
