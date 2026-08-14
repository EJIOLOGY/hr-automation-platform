import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EscalationStatus } from '../../generated/prisma/enums';

export interface EscalationQueueStatus {
  escalationId: string;
  status: EscalationStatus;
  queuePosition: number | null;
  hrBusy: boolean;
}

@Injectable()
export class EscalationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates an escalation for an employee and returns
   * the employee's current queue information.
   *
   * Rules:
   * - An employee can only have one active escalation.
   * - If HR is not currently attending to anyone, the first
   *   escalation becomes IN_PROGRESS.
   * - If HR is already attending to someone, new escalations
   *   remain OPEN and are placed in the queue.
   */
  async createOrGetActiveEscalation(
    employeeId: string,
    sessionId: string,
    reason: string,
  ): Promise<EscalationQueueStatus> {
    /**
     * Check whether this employee already has an active
     * escalation.
     */
    const existingEscalation = await this.prisma.escalation.findFirst({
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

    /**
     * If an active escalation already exists, reuse it.
     *
     * If it is OPEN and nobody is currently IN_PROGRESS,
     * promote this existing request so the queue does not
     * get stuck because of an earlier test/request.
     */
    if (existingEscalation) {
      if (existingEscalation.status === EscalationStatus.OPEN) {
        const hrInProgress = await this.prisma.escalation.findFirst({
          where: {
            status: EscalationStatus.IN_PROGRESS,
          },
          orderBy: {
            createdAt: 'asc',
          },
        });

        if (!hrInProgress) {
          const promotedEscalation = await this.prisma.escalation.update({
            where: {
              id: existingEscalation.id,
            },
            data: {
              status: EscalationStatus.IN_PROGRESS,
            },
          });

          return this.getQueueStatus(promotedEscalation.id);
        }
      }

      return this.getQueueStatus(existingEscalation.id);
    }

    /**
     * Check whether HR is currently attending to another
     * employee.
     */
    const hrInProgress = await this.prisma.escalation.findFirst({
      where: {
        status: EscalationStatus.IN_PROGRESS,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    /**
     * If HR is free, this becomes the active request.
     *
     * If HR is already busy, this request joins the queue.
     */
    const status = hrInProgress
      ? EscalationStatus.OPEN
      : EscalationStatus.IN_PROGRESS;

    const escalation = await this.prisma.escalation.create({
      data: {
        employeeId,
        sessionId,
        reason,
        status,
      },
    });

    return this.getQueueStatus(escalation.id);
  }

  /**
   * Returns the current queue status for an escalation.
   *
   * IN_PROGRESS:
   * - HR is currently attending to the employee.
   * - No queue position is returned.
   *
   * OPEN:
   * - Queue position is calculated dynamically based on
   *   earlier OPEN requests.
   * - The IN_PROGRESS request is not counted as a queue position.
   */
  async getQueueStatus(escalationId: string): Promise<EscalationQueueStatus> {
    const escalation = await this.prisma.escalation.findUnique({
      where: {
        id: escalationId,
      },
    });

    if (!escalation) {
      throw new Error('Escalation not found.');
    }

    /**
     * Determine whether HR is currently attending to
     * another escalation.
     */
    const hrInProgressCount = await this.prisma.escalation.count({
      where: {
        status: EscalationStatus.IN_PROGRESS,
      },
    });

    /**
     * This employee is currently being attended to.
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
     * For any non-active status, there is no queue position.
     */
    if (escalation.status !== EscalationStatus.OPEN) {
      return {
        escalationId: escalation.id,
        status: escalation.status,
        queuePosition: null,
        hrBusy: hrInProgressCount > 0,
      };
    }

    /**
     * Count only OPEN requests created before this request.
     *
     * Example:
     *
     * Employee A -> IN_PROGRESS
     * Employee B -> OPEN, position 1
     * Employee C -> OPEN, position 2
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
      hrBusy: hrInProgressCount > 0,
    };
  }
}
