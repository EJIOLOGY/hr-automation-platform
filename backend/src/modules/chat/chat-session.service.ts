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
      return existingSession;
    }

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
