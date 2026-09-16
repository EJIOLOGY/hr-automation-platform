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
}
