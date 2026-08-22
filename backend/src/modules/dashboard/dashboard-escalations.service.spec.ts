import { ConflictException, NotFoundException } from '@nestjs/common';
import { EscalationStatus } from '../../generated/prisma/enums';
import { DashboardEscalationsService } from './dashboard-escalations.service';

describe('DashboardEscalationsService', () => {
  let service: DashboardEscalationsService;
  let prisma: any;
  let escalationService: any;
  let auditService: any;

  const officerId = 'officer-1';
  const employee = {
    id: 'employee-1',
    employeeNumber: 'EMP001',
    fullName: 'Test Employee',
    phoneNumber: '2348000000000',
    department: 'HR',
    jobTitle: 'Engineer',
    status: 'ACTIVE',
  };
  const session = {
    id: 'session-1',
    currentState: 'MAIN_MENU',
    isActive: true,
    lastActivityAt: new Date('2026-08-21T10:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      escalation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    escalationService = {
      startHandling: jest.fn(),
      resolveEscalation: jest.fn(),
      closeEscalation: jest.fn(),
    };
    auditService = {
      log: jest.fn().mockResolvedValue({}),
    };

    service = new DashboardEscalationsService(
      prisma,
      escalationService,
      auditService,
    );
  });

  it('lists escalations with cursor pagination', async () => {
    const createdAt = new Date('2026-08-21T10:00:00.000Z');
    prisma.escalation.findMany.mockResolvedValue([
      {
        id: 'esc-1',
        createdAt,
        status: EscalationStatus.OPEN,
        employee,
        assignedHrOfficer: null,
        session,
      },
    ]);

    const result = await service.list({ limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
    expect(prisma.escalation.findMany).toHaveBeenCalled();
  });

  it('throws when escalation does not exist', async () => {
    prisma.escalation.findUnique.mockResolvedValue(null);

    await expect(service.getById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('claims an open escalation and audits the action', async () => {
    const openEscalation = {
      id: 'esc-1',
      status: EscalationStatus.OPEN,
      assignedHrOfficerId: null,
      employee,
      assignedHrOfficer: null,
      session,
    };
    const updated = {
      ...openEscalation,
      status: EscalationStatus.IN_PROGRESS,
      assignedHrOfficerId: officerId,
      assignedHrOfficer: {
        id: officerId,
        fullName: 'HR Officer',
        email: 'hr@example.com',
        role: 'OFFICER',
      },
    };

    prisma.escalation.findUnique.mockResolvedValue(openEscalation);
    escalationService.startHandling.mockResolvedValue({
      ...openEscalation,
      status: EscalationStatus.IN_PROGRESS,
    });
    prisma.escalation.update.mockResolvedValue(updated);

    const result = await service.claim('esc-1', { hrOfficerId: officerId });

    expect(result.assignedHrOfficerId).toBe(officerId);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ESCALATION_CLAIMED' }),
    );
  });

  it('rejects claiming an escalation assigned to another officer', async () => {
    prisma.escalation.findUnique.mockResolvedValue({
      id: 'esc-1',
      status: EscalationStatus.IN_PROGRESS,
      assignedHrOfficerId: 'other-officer',
      employee,
      assignedHrOfficer: null,
      session,
    });

    await expect(
      service.claim('esc-1', { hrOfficerId: officerId }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('resolves an escalation and records the resolution note', async () => {
    const escalation = {
      id: 'esc-1',
      status: EscalationStatus.IN_PROGRESS,
      assignedHrOfficerId: officerId,
      employee,
      assignedHrOfficer: null,
      session,
    };
    const resolved = {
      ...escalation,
      status: EscalationStatus.RESOLVED,
      resolvedAt: new Date(),
    };
    const updated = { ...resolved, resolutionNote: 'Resolved by HR.' };

    prisma.escalation.findUnique.mockResolvedValue(escalation);
    escalationService.resolveEscalation.mockResolvedValue(resolved);
    prisma.escalation.update.mockResolvedValue(updated);

    const result = await service.resolve('esc-1', {
      hrOfficerId: officerId,
      resolutionNote: 'Resolved by HR.',
    });

    expect(result.resolutionNote).toBe('Resolved by HR.');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ESCALATION_RESOLVED' }),
    );
  });

  it('closes a resolved escalation and audits the action', async () => {
    const escalation = {
      id: 'esc-1',
      status: EscalationStatus.RESOLVED,
      assignedHrOfficerId: officerId,
      employee,
      assignedHrOfficer: null,
      session,
    };
    const updated = { ...escalation, status: EscalationStatus.CLOSED };

    prisma.escalation.findUnique.mockResolvedValue(escalation);
    escalationService.closeEscalation.mockResolvedValue(updated);
    prisma.escalation.update.mockResolvedValue(updated);

    const result = await service.close('esc-1', { hrOfficerId: officerId });

    expect(result.status).toBe(EscalationStatus.CLOSED);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ESCALATION_CLOSED' }),
    );
  });
});
