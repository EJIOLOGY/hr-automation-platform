import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../core/prisma/prisma.service';
import { EmployeeStatus, EscalationStatus } from '../../generated/prisma/enums';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;

  const prisma = {
    chatSession: {
      count: jest.fn(),
    },
    employee: {
      count: jest.fn(),
    },
    escalation: {
      count: jest.fn(),
    },
  };

  const user: AuthenticatedUser = {
    id: 'hr-officer-1',
    fullName: 'HR Admin',
    email: 'hr@example.com',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should return dashboard overview metrics and authenticated user context', async () => {
    prisma.chatSession.count.mockResolvedValueOnce(42).mockResolvedValueOnce(7);

    prisma.employee.count.mockResolvedValueOnce(18);

    prisma.escalation.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);

    await expect(service.getOverview(user)).resolves.toEqual({
      user: {
        id: 'hr-officer-1',
        fullName: 'HR Admin',
        email: 'hr@example.com',
        role: 'ADMIN',
      },
      metrics: {
        totalConversations: 42,
        activeConversations: 7,
        activeEmployees: 18,
        openEscalations: 3,
        inProgressEscalations: 1,
      },
    });

    expect(prisma.chatSession.count).toHaveBeenNthCalledWith(1);
    expect(prisma.chatSession.count).toHaveBeenNthCalledWith(2, {
      where: {
        isActive: true,
      },
    });

    expect(prisma.employee.count).toHaveBeenCalledWith({
      where: {
        status: EmployeeStatus.ACTIVE,
      },
    });

    expect(prisma.escalation.count).toHaveBeenNthCalledWith(1, {
      where: {
        status: EscalationStatus.OPEN,
      },
    });

    expect(prisma.escalation.count).toHaveBeenNthCalledWith(2, {
      where: {
        status: EscalationStatus.IN_PROGRESS,
      },
    });
  });
});
