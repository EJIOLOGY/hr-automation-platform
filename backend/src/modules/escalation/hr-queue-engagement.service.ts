import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EscalationStatus, MessageDirection, MessageType } from '../../generated/prisma/enums';

export const QUEUE_ENGAGEMENT_PREFIX = 'HR_QUEUE_ENGAGEMENT:';

const FIRST_MESSAGE_DELAY_MS = 5 * 60 * 1000;
const SECOND_MESSAGE_DELAY_MS = 10 * 60 * 1000;
const RECURRING_MESSAGE_DELAY_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 60 * 1000;

@Injectable()
export class HrQueueEngagementService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HrQueueEngagementService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.processWaitingEscalations().catch((error: unknown) => {
        this.logger.error(
          'Failed to process HR queue engagement messages.',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }

  /**
   * Processes waiting HR escalations.
   *
   * Timing:
   * - 5 minutes after queue entry: first engagement message.
   * - 10 minutes after the first engagement: second engagement message.
   * - 30 minutes after the second and subsequent messages: periodic update.
   *
   * Only OPEN escalations are processed. Once HR starts handling the
   * ticket (IN_PROGRESS), engagement messages stop automatically.
   *
   * The message is persisted as an outbound ChatMessage. The WhatsApp
   * channel adapter will be responsible for delivering outbound messages
   * when the channel integration is connected.
   */
  async processWaitingEscalations(now = new Date()): Promise<number> {
    const waitingEscalations = await this.prisma.escalation.findMany({
      where: {
        status: EscalationStatus.OPEN,
      },
      include: {
        employee: {
          select: {
            fullName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    let processedCount = 0;

    for (const escalation of waitingEscalations) {
      const shouldSend = await this.shouldSendEngagement(
        escalation.sessionId,
        escalation.createdAt,
        now,
      );

      if (!shouldSend) {
        continue;
      }

      const engagementCount = await this.getEngagementCount(
        escalation.sessionId,
      );
      const queuePosition = await this.getQueuePosition(
        escalation.id,
        escalation.createdAt,
      );

      const message = this.buildEngagementMessage(
        escalation.employee.fullName,
        queuePosition,
        engagementCount,
      );

      await this.prisma.chatMessage.create({
        data: {
          sessionId: escalation.sessionId,
          direction: MessageDirection.OUTBOUND,
          messageType: MessageType.TEXT,
          content: `${QUEUE_ENGAGEMENT_PREFIX}${message}`,
        },
      });

      processedCount += 1;
    }

    return processedCount;
  }

  private async shouldSendEngagement(
    sessionId: string,
    escalationCreatedAt: Date,
    now: Date,
  ): Promise<boolean> {
    const lastEngagement = await this.prisma.chatMessage.findFirst({
      where: {
        sessionId,
        direction: MessageDirection.OUTBOUND,
        content: {
          startsWith: QUEUE_ENGAGEMENT_PREFIX,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
      },
    });

    if (!lastEngagement) {
      return (
        now.getTime() - escalationCreatedAt.getTime() >=
        FIRST_MESSAGE_DELAY_MS
      );
    }

    const engagementCount = await this.getEngagementCount(sessionId);
    const delay =
      engagementCount === 1
        ? SECOND_MESSAGE_DELAY_MS
        : RECURRING_MESSAGE_DELAY_MS;

    return now.getTime() - lastEngagement.createdAt.getTime() >= delay;
  }

  private async getEngagementCount(sessionId: string): Promise<number> {
    return this.prisma.chatMessage.count({
      where: {
        sessionId,
        direction: MessageDirection.OUTBOUND,
        content: {
          startsWith: QUEUE_ENGAGEMENT_PREFIX,
        },
      },
    });
  }

  private async getQueuePosition(
    escalationId: string,
    escalationCreatedAt: Date,
  ): Promise<number> {
    const requestsAhead = await this.prisma.escalation.count({
      where: {
        status: EscalationStatus.OPEN,
        createdAt: {
          lt: escalationCreatedAt,
        },
        id: {
          not: escalationId,
        },
      },
    });

    return requestsAhead + 1;
  }

  private buildEngagementMessage(
    fullName: string,
    queuePosition: number,
    engagementCount: number,
  ): string {
    const firstName = fullName.trim().split(/\s+/)[0] || 'there';

    if (engagementCount === 0) {
      return `Hi ${firstName}, we’re sorry for the wait. Our HR representatives are currently assisting other employees. You are still number ${queuePosition} in the HR queue, and your request will be attended to as soon as an HR representative becomes available.\n\nWhile you wait, you can continue using the bot.`;
    }

    if (engagementCount === 1) {
      return `Hi ${firstName}, we’re still working to connect you with an HR representative. Your request remains active in the HR queue and has not been lost.\n\nWhile you wait, you can continue using the bot. Thank you for your patience.`;
    }

    return `Hi ${firstName}, your HR request is still active in the queue. We’re sorry for the continued wait and will connect you with an HR representative as soon as one becomes available.\n\nWhile you wait, you can continue using the bot.`;
  }
}
