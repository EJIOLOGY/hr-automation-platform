import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class ChatSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateSession(employeeId: string, initialState: string) {
    const existingSession = await this.prisma.chatSession.findFirst({
      where: {
        employeeId,
        isActive: true,
      },
      orderBy: {
        lastActivityAt: 'desc',
      },
    });

    if (existingSession) {
      const sessionAge = Date.now() - existingSession.lastActivityAt.getTime();

      const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

      /**
       * Close sessions that have been inactive for 24 hours
       * or longer.
       */
      if (sessionAge >= SESSION_TIMEOUT_MS) {
        await this.prisma.chatSession.update({
          where: {
            id: existingSession.id,
          },
          data: {
            isActive: false,
            endedAt: new Date(),
          },
        });
      } else {
        return existingSession;
      }
    }

    /**
     * No active session exists, or the previous session
     * expired due to inactivity.
     */
    return this.prisma.chatSession.create({
      data: {
        employeeId,
        currentState: initialState,
      },
    });
  }

  /**
   * Update the current state of an active session.
   */
  async updateState(sessionId: string, state: string) {
    return this.prisma.chatSession.update({
      where: {
        id: sessionId,
      },
      data: {
        currentState: state,
        lastActivityAt: new Date(),
      },
    });
  }

  /**
   * Refresh session activity without changing the state.
   */
  async touch(sessionId: string) {
    return this.prisma.chatSession.update({
      where: {
        id: sessionId,
      },
      data: {
        lastActivityAt: new Date(),
      },
    });
  }

  /**
   * End the current session.
   */
  async endSession(sessionId: string) {
    return this.prisma.chatSession.update({
      where: {
        id: sessionId,
      },
      data: {
        isActive: false,
        endedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });
  }
}
