import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { EscalationStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EscalationService } from '../escalation/escalation.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WhatsappGraphClient } from '../whatsapp/whatsapp-graph-client.service';
import { PhoneNumberNormalizer } from '../../shared/utils/phone-number-normalizer';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const ACTOR_TYPE = 'HR_OFFICER';
const ENTITY_TYPE = 'ESCALATION';

interface EscalationCursor {
  createdAt: string;
  id: string;
}

export interface EscalationListQuery {
  status?: EscalationStatus;
  category?: string;
  documentType?: string;
  cursor?: string;
  limit?: number;
}

export interface EscalationActionInput {
  hrOfficerId: string;
  resolutionNote?: string;
}

@Injectable()
export class DashboardEscalationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escalationService: EscalationService,
    private readonly auditService: AuditService,
    private readonly whatsappGraphClient: WhatsappGraphClient,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async list(query: EscalationListQuery) {
    const limit = this.normalizeLimit(query.limit);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;

    const rows = await this.prisma.escalation.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.documentType ? { documentType: query.documentType } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                {
                  createdAt: new Date(cursor.createdAt),
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
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
        assignedHrOfficer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        session: {
          select: {
            id: true,
            currentState: true,
            isActive: true,
            lastActivityAt: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);

    return {
      items,
      nextCursor:
        hasMore && last
          ? this.encodeCursor({
              createdAt: last.createdAt.toISOString(),
              id: last.id,
            })
          : null,
    };
  }

  async getById(id: string) {
    const escalation = await this.prisma.escalation.findUnique({
      where: { id },
      include: {
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
        assignedHrOfficer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        session: {
          select: {
            id: true,
            currentState: true,
            isActive: true,
            startedAt: true,
            lastActivityAt: true,
            endedAt: true,
          },
        },
      },
    });

    if (!escalation) {
      throw new NotFoundException('Escalation not found.');
    }

    return escalation;
  }

  async claim(id: string, input: EscalationActionInput) {
    const escalation = await this.getById(id);

    if (
      escalation.status === EscalationStatus.RESOLVED ||
      escalation.status === EscalationStatus.CLOSED
    ) {
      throw new ConflictException('This escalation is already closed.');
    }

    if (
      escalation.status === EscalationStatus.IN_PROGRESS &&
      escalation.assignedHrOfficerId === input.hrOfficerId
    ) {
      return escalation;
    }

    if (
      escalation.status === EscalationStatus.IN_PROGRESS &&
      escalation.assignedHrOfficerId &&
      escalation.assignedHrOfficerId !== input.hrOfficerId
    ) {
      throw new ConflictException(
        'This escalation is already assigned to another HR officer.',
      );
    }

    const started = await this.escalationService.startHandling(id);

    if (started.status !== EscalationStatus.IN_PROGRESS) {
      throw new ConflictException(
        'This escalation cannot be claimed while another HR request is in progress.',
      );
    }

    const updated = await this.prisma.escalation.update({
      where: { id },
      data: { assignedHrOfficerId: input.hrOfficerId },
      include: {
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
        assignedHrOfficer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        session: {
          select: {
            id: true,
            currentState: true,
            isActive: true,
            lastActivityAt: true,
          },
        },
      },
    });

    await this.auditService.log({
      actorType: ACTOR_TYPE,
      actorHrOfficerId: input.hrOfficerId,
      action: 'ESCALATION_CLAIMED',
      entityType: ENTITY_TYPE,
      entityId: id,
      metadata: { previousStatus: escalation.status },
    });

    return updated;
  }

  async resolve(id: string, input: EscalationActionInput) {
    const escalation = await this.getById(id);

    if (escalation.status !== EscalationStatus.IN_PROGRESS) {
      throw new ConflictException(
        'Only an escalation in progress can be resolved.',
      );
    }

    if (
      escalation.assignedHrOfficerId &&
      escalation.assignedHrOfficerId !== input.hrOfficerId
    ) {
      throw new ConflictException(
        'This escalation is assigned to another HR officer.',
      );
    }

    const resolutionNote = this.normalizeResolutionNote(input.resolutionNote);

    const employeeMessage = this.buildResolutionMessage(
      escalation.employee.fullName,
    );

    await this.sendEmployeeNotification(
      escalation.employee.phoneNumber,
      employeeMessage,
    );

    const resolved = await this.escalationService.resolveEscalation(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedEscalation = await tx.escalation.update({
        where: { id },
        data: {
          resolutionNote: resolutionNote ?? undefined,
          assignedHrOfficerId:
            escalation.assignedHrOfficerId ?? input.hrOfficerId,
        },
        include: {
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
          assignedHrOfficer: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
          session: {
            select: {
              id: true,
              currentState: true,
              isActive: true,
              lastActivityAt: true,
            },
          },
        },
      });

      await tx.chatMessage.create({
        data: {
          sessionId: escalation.session.id,
          direction: 'OUTBOUND',
          messageType: 'TEXT',
          content: employeeMessage,
        },
      });

      await tx.chatMessage.create({
        data: {
          sessionId: escalation.session.id,
          direction: 'OUTBOUND',
          messageType: 'SYSTEM',
          content: 'STATE_TRANSITION:HR_QUEUE->AWAITING_FEEDBACK',
        },
      });

      await tx.chatSession.update({
        where: {
          id: escalation.session.id,
        },
        data: {
          currentState: 'AWAITING_FEEDBACK',
          lastActivityAt: new Date(),
        },
      });

      return updatedEscalation;
    });

    await this.auditService.log({
      actorType: ACTOR_TYPE,
      actorHrOfficerId: input.hrOfficerId,
      action: 'ESCALATION_RESOLVED',
      entityType: ENTITY_TYPE,
      entityId: id,
      metadata: {
        previousStatus: escalation.status,
        resolutionNoteProvided: Boolean(resolutionNote),
        resolvedAt: resolved.resolvedAt?.toISOString() ?? null,
      },
    });

    this.realtimeGateway.notifyNewMessage(escalation.session.id, 'OUTBOUND');

    return updated;
  }

  async close(id: string, input: EscalationActionInput) {
    const escalation = await this.getById(id);

    if (
      escalation.status !== EscalationStatus.IN_PROGRESS &&
      escalation.status !== EscalationStatus.RESOLVED
    ) {
      throw new ConflictException(
        'Only an escalation in progress or resolved can be closed.',
      );
    }

    if (
      escalation.assignedHrOfficerId &&
      escalation.assignedHrOfficerId !== input.hrOfficerId
    ) {
      throw new ConflictException(
        'This escalation is assigned to another HR officer.',
      );
    }

    const resolutionNote = this.normalizeResolutionNote(input.resolutionNote);

    await this.escalationService.closeEscalation(id);

    // Closing is backend/audit only. The employee already received the
    // resolution message and feedback prompt when the escalation was resolved.
    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.escalation.update({
        where: { id },
        data: {
          resolutionNote: resolutionNote ?? undefined,
          assignedHrOfficerId:
            escalation.assignedHrOfficerId ?? input.hrOfficerId,
        },
        include: {
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
          assignedHrOfficer: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
          session: {
            select: {
              id: true,
              currentState: true,
              isActive: true,
              lastActivityAt: true,
            },
          },
        },
      });
    });

    await this.auditService.log({
      actorType: ACTOR_TYPE,
      actorHrOfficerId: input.hrOfficerId,
      action: 'ESCALATION_CLOSED',
      entityType: ENTITY_TYPE,
      entityId: id,
      metadata: {
        previousStatus: escalation.status,
        resolutionNoteProvided: Boolean(resolutionNote),
      },
    });

    return updated;
  }

  private async sendEmployeeNotification(
    phoneNumber: string,
    message: string,
  ): Promise<void> {
    const recipient = PhoneNumberNormalizer.normalize(phoneNumber).replace(
      /^\+/,
      '',
    );

    const sent = await this.whatsappGraphClient.sendMessage(recipient, {
      type: 'text',
      text: message,
    });

    if (!sent) {
      throw new BadRequestException(
        'Unable to notify the employee on WhatsApp. The escalation was not completed. Please try again.',
      );
    }
  }

  private buildResolutionMessage(fullName: string): string {
    const firstName = fullName.trim().split(/\s+/)[0] || 'there';

    return `Hi ${firstName}, your HR request has been resolved. Thank you for contacting HR.\n\n*How was your experience?*\n\nPlease rate your experience from *1 to 5*, and optionally tell us why.\n\n*Reply like:*\n*5 — HR was very helpful.*`;
  }

  private normalizeLimit(value?: number) {
    if (value === undefined) return DEFAULT_LIMIT;

    if (!Number.isInteger(value) || value < 1) {
      throw new BadRequestException('limit must be a positive integer.');
    }

    return Math.min(value, MAX_LIMIT);
  }

  private normalizeResolutionNote(value?: string) {
    const note = value?.trim();

    if (note && note.length > 2000) {
      throw new BadRequestException(
        'resolutionNote must not exceed 2000 characters.',
      );
    }

    return note || undefined;
  }

  private encodeCursor(cursor: EscalationCursor) {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(value: string): EscalationCursor {
    try {
      const decoded = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as Partial<EscalationCursor>;

      if (
        typeof decoded.id !== 'string' ||
        typeof decoded.createdAt !== 'string' ||
        Number.isNaN(new Date(decoded.createdAt).getTime())
      ) {
        throw new Error('Invalid cursor');
      }

      return {
        id: decoded.id,
        createdAt: decoded.createdAt,
      };
    } catch {
      throw new BadRequestException('Invalid cursor.');
    }
  }
}
