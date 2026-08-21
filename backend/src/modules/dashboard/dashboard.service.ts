import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';
import { EmployeeStatus, EscalationStatus } from '../../generated/prisma/enums';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(user: AuthenticatedUser) {
    const [
      totalConversations,
      activeConversations,
      activeEmployees,
      openEscalations,
      inProgressEscalations,
    ] = await Promise.all([
      this.prisma.chatSession.count(),

      this.prisma.chatSession.count({
        where: {
          isActive: true,
        },
      }),

      this.prisma.employee.count({
        where: {
          status: EmployeeStatus.ACTIVE,
        },
      }),

      this.prisma.escalation.count({
        where: {
          status: EscalationStatus.OPEN,
        },
      }),

      this.prisma.escalation.count({
        where: {
          status: EscalationStatus.IN_PROGRESS,
        },
      }),
    ]);

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
      metrics: {
        totalConversations,
        activeConversations,
        activeEmployees,
        openEscalations,
        inProgressEscalations,
      },
    };
  }
}
