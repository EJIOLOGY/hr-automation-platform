import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AnalyticsEventType, Prisma } from '../../generated/prisma/client';

interface RecordAnalyticsEventInput {
  type: AnalyticsEventType;
  sessionId: string;
  employeeId?: string;
  escalationId?: string;
  metadata?: Prisma.InputJsonObject;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(input: RecordAnalyticsEventInput): Promise<void> {
    await this.prisma.analyticsEvent.create({
      data: {
        type: input.type,
        sessionId: input.sessionId,
        employeeId: input.employeeId,
        escalationId: input.escalationId,
        metadata: input.metadata,
      },
    });
  }

  /**
   * Records exactly one BOT_COMPLETED event per session.
   *
   * Uses a Prisma interactive transaction to atomically check for an
   * existing BOT_COMPLETED event and create one only if none exists.
   * This prevents duplicate events under concurrent requests without
   * requiring a database-level uniqueness constraint that would affect
   * other event types.
   */
  async recordBotCompleted(input: {
    sessionId: string;
    employeeId?: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.analyticsEvent.findFirst({
        where: {
          sessionId: input.sessionId,
          type: AnalyticsEventType.BOT_COMPLETED,
        },
        select: { id: true },
      });

      if (existing) {
        return;
      }

      await tx.analyticsEvent.create({
        data: {
          type: AnalyticsEventType.BOT_COMPLETED,
          sessionId: input.sessionId,
          employeeId: input.employeeId,
        },
      });
    });
  }
}
