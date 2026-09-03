import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EscalationStatus } from '../../generated/prisma/enums';
import { MENU_CONFIG, MENU_IDS } from '../chat/menu.config';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

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
        lastReadByHrAt: true,
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
            assignedHrOfficerId: true,
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
        lastReadByHrAt: session.lastReadByHrAt,
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
    const pageItems = hasNextPage ? messages.slice(0, take) : messages;
    const lastItem = pageItems[pageItems.length - 1];

    /*
     * Menu replies are not persisted as outbound ChatMessage records.
     * State-transition system messages are persisted, however, so we can
     * replay the deterministic menu state and resolve historical numeric
     * employee selections against the menu that was active at that point.
     *
     * This deliberately uses MENU_CONFIG as the single source of truth.
     */
    const allMessages = await this.prisma.chatMessage.findMany({
      where: {
        sessionId,
      },
      orderBy: [
        {
          createdAt: 'asc',
        },
        {
          id: 'asc',
        },
      ],
      select: {
        id: true,
        direction: true,
        messageType: true,
        content: true,
      },
    });

    const displayContentByMessageId = this.buildDisplayContentMap(allMessages);

    const items = pageItems
      .reverse()
      .map((message) => ({
        ...message,
        displayContent:
          displayContentByMessageId.get(message.id) ?? message.content,
      }));

    return {
      items,
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

  private buildDisplayContentMap(
    messages: Array<{
      id: string;
      direction: string;
      messageType: string;
      content: string;
    }>,
  ): Map<string, string> {
    const displayContentByMessageId = new Map<string, string>();
    let currentState = 'MAIN_MENU';

    for (const message of messages) {
      const transition = this.parseStateTransition(message.content);

      if (transition) {
        currentState = transition.nextState;
        continue;
      }

      if (
        message.direction !== 'INBOUND' ||
        message.messageType !== 'TEXT' ||
        !/^\d+$/.test(message.content.trim())
      ) {
        continue;
      }

      const menuId = this.getMenuIdForState(currentState);

      if (!menuId) {
        continue;
      }

      const selectionNumber = Number(message.content.trim());

      if (!Number.isInteger(selectionNumber) || selectionNumber < 1) {
        continue;
      }

      const menu = MENU_CONFIG.find((candidate) => candidate.id === menuId);
      const option = menu?.options[selectionNumber - 1];

      if (option) {
        displayContentByMessageId.set(
          message.id,
          `[${selectionNumber}] ${option.label}`,
        );
      }
    }

    return displayContentByMessageId;
  }

  private parseStateTransition(
    content: string,
  ): { previousState: string; nextState: string } | undefined {
    const match = /^STATE_TRANSITION:([^->]+)->(.+)$/i.exec(content.trim());

    if (!match) {
      return undefined;
    }

    return {
      previousState: match[1],
      nextState: match[2],
    };
  }

  private getMenuIdForState(state: string): string | undefined {
    switch (state) {
      case 'MAIN_MENU':
        return MENU_IDS.MAIN;
      case 'POLICY_MENU':
        return MENU_IDS.POLICY;
      case 'LEAVE_MENU':
        return MENU_IDS.LEAVE;
      case 'BENEFITS_MENU':
        return MENU_IDS.BENEFITS;
      case 'VERIFICATION_MENU':
        return MENU_IDS.VERIFICATION;
      case 'DOCUMENT_REQUEST_MENU':
        return MENU_IDS.DOCUMENT_REQUEST;
      default:
        return undefined;
    }
  }

  async replyToConversation(
    sessionId: string,
    hrOfficerId: string,
    content: string,
  ) {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      throw new BadRequestException('Message content cannot be empty.');
    }

    if (trimmedContent.length > 2000) {
      throw new BadRequestException(
        'Message content must not exceed 2000 characters.',
      );
    }

    const session = await this.prisma.chatSession.findUnique({
      where: {
        id: sessionId,
      },
      select: {
        id: true,
        isActive: true,
        escalations: {
          where: {
            status: EscalationStatus.IN_PROGRESS,
          },
          orderBy: [
            {
              createdAt: 'asc',
            },
            {
              id: 'asc',
            },
          ],
          take: 1,
          select: {
            id: true,
            assignedHrOfficerId: true,
            status: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Conversation not found.');
    }

    const activeEscalation = session.escalations[0];

    if (!activeEscalation) {
      throw new ForbiddenException(
        'This conversation is not currently assigned to an HR officer.',
      );
    }

    if (activeEscalation.assignedHrOfficerId !== hrOfficerId) {
      throw new ForbiddenException(
        'This conversation is assigned to another HR officer.',
      );
    }

    const now = new Date();

    const message = await this.prisma.$transaction(async (tx) => {
      const createdMessage = await tx.chatMessage.create({
        data: {
          sessionId,
          direction: 'OUTBOUND',
          messageType: 'TEXT',
          content: trimmedContent,
          sentByHrOfficerId: hrOfficerId,
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

      await tx.chatSession.update({
        where: {
          id: sessionId,
        },
        data: {
          lastActivityAt: now,
        },
      });

      return createdMessage;
    });

    await this.auditService.log({
      actorType: 'HR_OFFICER',
      actorHrOfficerId: hrOfficerId,
      action: 'HR_MESSAGE_SENT',
      entityType: 'CHAT_MESSAGE',
      entityId: message.id,
      metadata: {
        sessionId,
        escalationId: activeEscalation.id,
      },
    });

    return message;
  }

  async markConversationRead(sessionId: string, hrOfficerId: string) {
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

    const readAt = new Date();

    const updatedSession = await this.prisma.chatSession.update({
      where: {
        id: sessionId,
      },
      data: {
        lastReadByHrAt: readAt,
      },
      select: {
        id: true,
        lastReadByHrAt: true,
      },
    });

    await this.auditService.log({
      actorType: 'HR_OFFICER',
      actorHrOfficerId: hrOfficerId,
      action: 'CONVERSATION_READ',
      entityType: 'CHAT_SESSION',
      entityId: sessionId,
      metadata: {
        readAt: updatedSession.lastReadByHrAt?.toISOString() ?? null,
      },
    });

    return updatedSession;
  }
}
