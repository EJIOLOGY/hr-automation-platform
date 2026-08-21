import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';
import { EscalationStatus } from '../../generated/prisma/enums';

interface ConversationCursor {
  lastActivityAt: string;
  id: string;
}

interface MessageCursor {
  createdAt: string;
  id: string;
}

@Injectable()
export class DashboardConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  private encodeCursor(cursor: ConversationCursor | MessageCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor<T extends ConversationCursor | MessageCursor>(
    cursor: string,
  ): T {
    try {
      return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
    } catch {
      throw new BadRequestException('Invalid pagination cursor.');
    }
  }

  async listConversations(limit = 25, cursor?: string) {
    const take = Math.min(Math.max(limit, 1), 50);

    let cursorFilter = {};

    if (cursor) {
      const decoded = this.decodeCursor<ConversationCursor>(cursor);
      const lastActivityAt = new Date(decoded.lastActivityAt);

      if (Number.isNaN(lastActivityAt.getTime())) {
        throw new BadRequestException('Invalid pagination cursor.');
      }

      cursorFilter = {
        OR: [
          {
            lastActivityAt: {
              lt: lastActivityAt,
            },
          },
          {
            lastActivityAt,
            id: {
              lt: decoded.id,
            },
          },
        ],
      };
    }

    const sessions = await this.prisma.chatSession.findMany({
      where: cursorFilter,
      take: take + 1,
      orderBy: [
        {
          lastActivityAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      select: {
        id: true,
        currentState: true,
        isActive: true,
        startedAt: true,
        lastActivityAt: true,
        endedAt: true,

        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            phoneNumber: true,
            department: true,
            jobTitle: true,
            status: true,
          },
        },

        messages: {
          take: 1,
          orderBy: [
            {
              createdAt: 'desc',
            },
            {
              id: 'desc',
            },
          ],
          select: {
            id: true,
            direction: true,
            messageType: true,
            content: true,
            sentByHrOfficerId: true,
            createdAt: true,
          },
        },

        escalations: {
          where: {
            status: {
              in: [EscalationStatus.OPEN, EscalationStatus.IN_PROGRESS],
            },
          },
          orderBy: [
            {
              createdAt: 'desc',
            },
            {
              id: 'desc',
            },
          ],
          take: 1,
          select: {
            id: true,
            reason: true,
            status: true,
            category: true,
            documentType: true,
            createdAt: true,
          },
        },
      },
    });

    const hasNextPage = sessions.length > take;
    const items = hasNextPage ? sessions.slice(0, take) : sessions;

    const lastItem = items[items.length - 1];

    return {
      items: items.map((session) => ({
        id: session.id,
        employee: session.employee,
        currentState: session.currentState,
        isActive: session.isActive,
        startedAt: session.startedAt,
        lastActivityAt: session.lastActivityAt,
        endedAt: session.endedAt,
        latestMessage: session.messages[0] ?? null,
        activeEscalation: session.escalations[0] ?? null,
      })),

      pagination: {
        limit: take,
        hasNextPage,
        nextCursor:
          hasNextPage && lastItem
            ? this.encodeCursor({
                lastActivityAt: lastItem.lastActivityAt.toISOString(),
                id: lastItem.id,
              })
            : null,
      },
    };
  }

  async getMessages(sessionId: string, limit = 50, cursor?: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: {
        id: sessionId,
      },
      select: {
        id: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Conversation not found.');
    }

    const take = Math.min(Math.max(limit, 1), 100);

    let cursorFilter = {};

    if (cursor) {
      const decoded = this.decodeCursor<MessageCursor>(cursor);
      const createdAt = new Date(decoded.createdAt);

      if (Number.isNaN(createdAt.getTime())) {
        throw new BadRequestException('Invalid pagination cursor.');
      }

      cursorFilter = {
        OR: [
          {
            createdAt: {
              lt: createdAt,
            },
          },
          {
            createdAt,
            id: {
              lt: decoded.id,
            },
          },
        ],
      };
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        sessionId,
        ...cursorFilter,
      },
      take: take + 1,
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      select: {
        id: true,
        direction: true,
        messageType: true,
        content: true,
        sentByHrOfficerId: true,
        sentByHrOfficer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        createdAt: true,
      },
    });

    const hasNextPage = messages.length > take;
    const items = hasNextPage ? messages.slice(0, take) : messages;

    const lastItem = items[items.length - 1];

    return {
      items: items.reverse(),

      pagination: {
        limit: take,
        hasNextPage,
        nextCursor:
          hasNextPage && lastItem
            ? this.encodeCursor({
                createdAt: lastItem.createdAt.toISOString(),
                id: lastItem.id,
              })
            : null,
      },
    };
  }
}
