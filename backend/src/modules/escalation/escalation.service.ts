import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EscalationStatus } from '../../generated/prisma/enums';

export interface EscalationQueueStatus {
  escalationId: string;
  status: EscalationStatus;
  queuePosition: number | null;
  hrBusy: boolean;
}

export interface EscalationRequestContext {
  category?: string;
  documentType?: string;
}

@Injectable()
export class EscalationService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrGetActiveEscalation(
    employeeId: string,
    sessionId: string,
    reason: string,
    context?: EscalationRequestContext,
  ): Promise<EscalationQueueStatus> {
    const existingEscalation = await this.findReusableActiveEscalation(
      employeeId,
      context,
    );

    /**
     * Check whether another employee is currently
     * being attended to by HR.
     */
    const activeHrRequest = await this.prisma.escalation.findFirst({
      where: {
        status: EscalationStatus.IN_PROGRESS,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    /**
     * Reuse an existing active escalation only when it
     * represents the same request context.
     *
     * Document requests are matched by category + documentType.
     * General HR escalations retain the existing employee-level
     * reuse behaviour.
     *
     * Reusing an existing OPEN escalation does not promote it
     * implicitly. Queue progression is handled explicitly through
     * startHandling(), preserving the existing single-queue semantics.
     */
    if (existingEscalation) {
      return this.getQueueStatus(existingEscalation.id);
    }

    /**
     * If HR is free, this request goes directly to HR.
     *
     * If HR is busy, this request enters the waiting queue.
     */
    const status = activeHrRequest
      ? EscalationStatus.OPEN
      : EscalationStatus.IN_PROGRESS;

    const escalation = await this.prisma.escalation.create({
      data: {
        employeeId,
        sessionId,
        reason,
        status,
        ...(context?.category !== undefined
          ? { category: context.category }
          : {}),
        ...(context?.documentType !== undefined
          ? { documentType: context.documentType }
          : {}),
      },
    });

    return this.getQueueStatus(escalation.id);
  }

  private async findReusableActiveEscalation(
    employeeId: string,
    context?: EscalationRequestContext,
  ) {
    if (context?.category === 'DOCUMENT_REQUEST') {
      if (!context.documentType) {
        return null;
      }

      return this.prisma.escalation.findFirst({
        where: {
          employeeId,
          status: {
            in: [EscalationStatus.OPEN, EscalationStatus.IN_PROGRESS],
          },
          category: 'DOCUMENT_REQUEST',
          documentType: context.documentType,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
    }

    return this.prisma.escalation.findFirst({
      where: {
        employeeId,
        status: {
          in: [EscalationStatus.OPEN, EscalationStatus.IN_PROGRESS],
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async getQueueStatus(escalationId: string): Promise<EscalationQueueStatus> {
    const escalation = await this.prisma.escalation.findUnique({
      where: {
        id: escalationId,
      },
    });

    if (!escalation) {
      throw new NotFoundException('Escalation not found.');
    }

    /**
     * Check whether HR is currently attending
     * to an escalation.
     */
    const hrInProgressCount = await this.prisma.escalation.count({
      where: {
        status: EscalationStatus.IN_PROGRESS,
      },
    });

    const hrBusy = hrInProgressCount > 0;

    /**
     * Employee is currently being attended to.
     * Therefore they are not waiting in the queue.
     */
    if (escalation.status === EscalationStatus.IN_PROGRESS) {
      return {
        escalationId: escalation.id,
        status: escalation.status,
        queuePosition: null,
        hrBusy: true,
      };
    }

    /**
     * Resolved and closed escalations are no longer
     * part of the active queue.
     */
    if (
      escalation.status === EscalationStatus.RESOLVED ||
      escalation.status === EscalationStatus.CLOSED
    ) {
      return {
        escalationId: escalation.id,
        status: escalation.status,
        queuePosition: null,
        hrBusy,
      };
    }

    /**
     * OPEN escalation.
     *
     * Count earlier OPEN requests only.
     */
    const requestsAhead = await this.prisma.escalation.count({
      where: {
        status: EscalationStatus.OPEN,
        createdAt: {
          lt: escalation.createdAt,
        },
      },
    });

    return {
      escalationId: escalation.id,
      status: escalation.status,
      queuePosition: requestsAhead + 1,
      hrBusy,
    };
  }

  async startHandling(escalationId: string) {
    const escalation = await this.prisma.escalation.findUnique({
      where: {
        id: escalationId,
      },
    });

    if (!escalation) {
      throw new NotFoundException('Escalation not found.');
    }

    if (escalation.status !== EscalationStatus.OPEN) {
      return escalation;
    }

    /**
     * Only allow this escalation to become IN_PROGRESS
     * when no other escalation is currently being handled.
     */
    const activeHrRequest = await this.prisma.escalation.findFirst({
      where: {
        status: EscalationStatus.IN_PROGRESS,
      },
    });

    if (activeHrRequest) {
      return escalation;
    }

    return this.prisma.escalation.update({
      where: {
        id: escalationId,
      },
      data: {
        status: EscalationStatus.IN_PROGRESS,
      },
    });
  }

  async resolveEscalation(escalationId: string) {
    const escalation = await this.prisma.escalation.findUnique({
      where: {
        id: escalationId,
      },
    });

    if (!escalation) {
      throw new NotFoundException('Escalation not found.');
    }

    return this.prisma.escalation.update({
      where: {
        id: escalationId,
      },
      data: {
        status: EscalationStatus.RESOLVED,
        resolvedAt: new Date(),
      },
    });
  }

  async closeEscalation(escalationId: string) {
    const escalation = await this.prisma.escalation.findUnique({
      where: {
        id: escalationId,
      },
    });

    if (!escalation) {
      throw new NotFoundException('Escalation not found.');
    }

    return this.prisma.escalation.update({
      where: {
        id: escalationId,
      },
      data: {
        status: EscalationStatus.CLOSED,
        resolvedAt: escalation.resolvedAt ?? new Date(),
      },
    });
  }
}
