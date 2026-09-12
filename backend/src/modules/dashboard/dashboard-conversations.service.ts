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
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WhatsappGraphClient } from '../whatsapp/whatsapp-graph-client.service';
import { PhoneNumberNormalizer } from '../../shared/utils/phone-number-normalizer';
import { HrDocumentRequestService } from '../verification/hr-document-request.service';

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
    private readonly whatsappGraphClient: WhatsappGraphClient,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly hrDocumentRequestService: HrDocumentRequestService,
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
     * Technical system messages remain stored exactly as they are.
     * buildDisplayContentMap() only creates a human-friendly representation
     * for the dashboard.
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
        createdAt: true,
      },
    });

    const escalations = await this.prisma.escalation.findMany({
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
        reason: true,
        status: true,
        category: true,
        documentType: true,
        createdAt: true,
      },
    });

    const displayContentByMessageId = await this.buildDisplayContentMap(
      allMessages,
      escalations,
    );

    const items = pageItems.reverse().map((message) => ({
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

  private async buildDisplayContentMap(
    messages: Array<{
      id: string;
      direction: string;
      messageType: string;
      content: string;
      createdAt: Date;
    }>,
    escalations: Array<{
      id: string;
      reason: string;
      status: EscalationStatus;
      category: string | null;
      documentType: string | null;
      createdAt: Date;
    }>,
  ): Promise<Map<string, string>> {
    const displayContentByMessageId = new Map<string, string>();
    let currentState = 'MAIN_MENU';
    let currentDocumentTypeId: string | undefined;

    for (const message of messages) {
      const transition = this.parseStateTransition(message.content);

      if (transition) {
        currentState = transition.nextState;

        if (
          transition.nextState !== 'DOCUMENT_REQUEST_MENU' &&
          transition.nextState !== 'VERIFICATION_MENU'
        ) {
          currentDocumentTypeId = undefined;
        }

        displayContentByMessageId.set(
          message.id,
          this.getStateTransitionDisplayMessage(transition),
        );

        continue;
      }

      const queueMessage = this.parseQueueSystemMessage(message.content);

      if (queueMessage) {
        displayContentByMessageId.set(
          message.id,
          await this.getQueueDisplayMessage(
            queueMessage,
            escalations,
            message.createdAt,
            currentDocumentTypeId,
          ),
        );

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

        if (menuId === MENU_IDS.DOCUMENT_REQUEST) {
          currentDocumentTypeId = option.id;
        }
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

  private getStateTransitionDisplayMessage(transition: {
    previousState: string;
    nextState: string;
  }): string {
    const stateMessages: Record<string, string> = {
      MAIN_MENU: 'Employee returned to the main menu.',
      POLICY_MENU: 'Employee opened HR Questions.',
      LEAVE_MENU: 'Employee opened Leave & Time Off.',
      BENEFITS_MENU: 'Employee opened Benefits.',
      VERIFICATION_MENU: 'Employee opened HR Document Requests.',
      DOCUMENT_REQUEST_MENU: 'Employee opened HR Document Requests.',
    };

    const message = stateMessages[transition.nextState];

    if (message) {
      return message;
    }

    return `Employee moved to ${this.humanizeStateName(transition.nextState)}.`;
  }

  private humanizeStateName(state: string): string {
    return state
      .replace(/_MENU$/i, '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private parseQueueSystemMessage(content: string):
    | {
        type: 'escalation';
        reason: string;
        queuePosition: number;
      }
    | {
        type: 'queue_engagement';
        message: string;
      }
    | undefined {
    const normalizedContent = content.trim();

    const escalationMatch = /^ESCALATION:(.+?):QUEUE_POSITION:(\d+)$/i.exec(
      normalizedContent,
    );

    if (escalationMatch) {
      return {
        type: 'escalation',
        reason: escalationMatch[1],
        queuePosition: Number(escalationMatch[2]),
      };
    }

    const queueEngagementMatch = /^HR_QUEUE_ENGAGEMENT:(.+)$/i.exec(
      normalizedContent,
    );

    if (queueEngagementMatch) {
      return {
        type: 'queue_engagement',
        message: queueEngagementMatch[1],
      };
    }

    return undefined;
  }

  private async getQueueDisplayMessage(
    queueMessage:
      | {
          type: 'escalation';
          reason: string;
          queuePosition: number;
        }
      | {
          type: 'queue_engagement';
          message: string;
        },
    escalations: Array<{
      id: string;
      reason: string;
      status: EscalationStatus;
      category: string | null;
      documentType: string | null;
      createdAt: Date;
    }>,
    messageCreatedAt: Date,
    currentDocumentTypeId?: string,
  ): Promise<string> {
    if (queueMessage.type === 'queue_engagement') {
      const escalation = this.findEscalationForMessage(
        escalations,
        messageCreatedAt,
      );

      const queuePosition = escalation
        ? await this.getCurrentQueuePosition(escalations, escalation.id)
        : null;

      if (queuePosition !== null) {
        return this.humanizeQueueEngagementMessage(
          queueMessage.message,
          queuePosition,
        );
      }

      return this.humanizeQueueEngagementMessage(queueMessage.message);
    }

    const escalation = this.findEscalationForMessage(
      escalations,
      messageCreatedAt,
      queueMessage.reason,
    );

    const documentTypeId =
      escalation?.documentType?.trim() || currentDocumentTypeId;

    if (documentTypeId && this.isDocumentRequestReason(queueMessage.reason)) {
      const documentRequest =
        this.hrDocumentRequestService.createRequest(documentTypeId);

      if (documentRequest) {
        const queuePosition = escalation
          ? await this.getCurrentQueuePosition(escalations, escalation.id)
          : null;

        return `Employee requested a document: ${
          documentRequest.label
        }. Queue position: ${queuePosition ?? queueMessage.queuePosition}.`;
      }
    }

    const reason = this.humanizeEscalationReason(queueMessage.reason);

    const queuePosition = escalation
      ? await this.getCurrentQueuePosition(escalations, escalation.id)
      : null;

    return `Employee requested HR assistance${
      reason ? ` for ${reason}` : ''
    }. Queue position: ${queuePosition ?? queueMessage.queuePosition}.`;
  }

  private findEscalationForMessage(
    escalations: Array<{
      id: string;
      reason: string;
      status: EscalationStatus;
      category: string | null;
      documentType: string | null;
      createdAt: Date;
    }>,
    messageCreatedAt: Date,
    reason?: string,
  ) {
    const matching = escalations.filter(
      (escalation) =>
        escalation.createdAt.getTime() <= messageCreatedAt.getTime() &&
        (!reason ||
          escalation.reason.trim().toLowerCase() ===
            reason.trim().toLowerCase()),
    );

    return (
      matching[matching.length - 1] ??
      escalations
        .filter(
          (escalation) =>
            escalation.createdAt.getTime() <= messageCreatedAt.getTime(),
        )
        .at(-1)
    );
  }

  private async getCurrentQueuePosition(
    escalations: Array<{
      id: string;
      reason: string;
      status: EscalationStatus;
      category: string | null;
      documentType: string | null;
      createdAt: Date;
    }>,
    escalationId: string,
  ): Promise<number | null> {
    const escalation = escalations.find(
      (candidate) => candidate.id === escalationId,
    );

    if (!escalation || escalation.status !== EscalationStatus.OPEN) {
      return null;
    }

    const requestsAhead = escalations.filter(
      (candidate) =>
        candidate.status === EscalationStatus.OPEN &&
        (candidate.createdAt.getTime() < escalation.createdAt.getTime() ||
          (candidate.createdAt.getTime() === escalation.createdAt.getTime() &&
            candidate.id < escalation.id)),
    ).length;

    return requestsAhead + 1;
  }

  private isDocumentRequestReason(reason: string): boolean {
    const normalizedReason = reason.trim().replace(/\s+/g, '_').toUpperCase();

    return [
      'DOCUMENT',
      'HR_DOCUMENT',
      'DOCUMENT_REQUEST',
      'EMPLOYMENT_VERIFICATION',
    ].includes(normalizedReason);
  }

  private humanizeEscalationReason(reason: string): string {
    const normalizedReason = reason.trim();

    if (!normalizedReason) {
      return '';
    }

    const reasonLabels: Record<string, string> = {
      PERSONAL: 'a personal matter',
      PERSONAL_MATTER: 'a personal matter',
      LEAVE: 'a leave-related matter',
      BENEFITS: 'a benefits-related matter',
      DOCUMENT: 'an HR document request',
      HR_DOCUMENT: 'an HR document request',
      DOCUMENT_REQUEST: 'an HR document request',
      EMPLOYMENT_VERIFICATION: 'an employment verification request',
    };

    const normalizedKey = normalizedReason.replace(/\s+/g, '_').toUpperCase();

    return (
      reasonLabels[normalizedKey] ??
      normalizedReason
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (character) => character.toUpperCase())
    );
  }

  private humanizeQueueEngagementMessage(
    message: string,
    queuePosition?: number,
  ): string {
    const normalizedMessage = message.trim();

    if (!normalizedMessage) {
      return 'HR queue status updated.';
    }

    const humanizedMessage = normalizedMessage
      .replace(/QUEUE_POSITION/gi, 'queue position')
      .replace(/IN_PROGRESS/gi, 'being attended to')
      .replace(/_+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (queuePosition === undefined) {
      return humanizedMessage;
    }

    return humanizedMessage.replace(
      /\bnumber \d+\b/gi,
      `number ${queuePosition}`,
    );
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
        employee: {
          select: {
            phoneNumber: true,
          },
        },
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

    const recipientPhoneNumber = PhoneNumberNormalizer.normalize(
      session.employee.phoneNumber,
    ).replace(/^\+/, '');

    const sent = await this.whatsappGraphClient.sendMessage(
      recipientPhoneNumber,
      {
        type: 'text',
        text: trimmedContent,
      },
    );

    if (!sent) {
      throw new BadRequestException(
        'Unable to send the message to the employee on WhatsApp. Please try again.',
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

    this.realtimeGateway.notifyNewMessage(sessionId, 'OUTBOUND');

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
