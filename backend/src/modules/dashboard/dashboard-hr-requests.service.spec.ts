import { NotFoundException } from '@nestjs/common';
import { EscalationStatus } from '../../generated/prisma/enums';
import { DashboardHrRequestsService } from './dashboard-hr-requests.service';

describe('DashboardHrRequestsService', () => {
  let service: DashboardHrRequestsService;
  let prisma: any;

  const employee = {
    id: 'employee-1',
    employeeNumber: 'EMP001',
    fullName: 'Test Employee',
    phoneNumber: '2348000000000',
    department: 'Operations',
    jobTitle: 'Engineer',
    status: 'ACTIVE',
  };

  const session = {
    id: 'session-1',
    currentState: 'HR_QUEUE',
    isActive: true,
    lastActivityAt: new Date('2026-08-21T10:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      escalation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    service = new DashboardHrRequestsService(prisma);
  });

  it('lists structured document requests', async () => {
    const createdAt = new Date('2026-08-21T10:00:00.000Z');

    prisma.escalation.findMany.mockResolvedValue([
      {
        id: 'esc-1',
        category: 'DOCUMENT_REQUEST',
        documentType: 'salary_certificate',
        reason: 'HR document request: Salary Certificate',
        status: EscalationStatus.OPEN,
        resolutionNote: null,
        createdAt,
        resolvedAt: null,
        employee,
        assignedHrOfficer: null,
        session,
      },
    ]);

    const result = await service.list({ limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      category: 'DOCUMENT_REQUEST',
      documentType: 'salary_certificate',
      documentLabel: 'Salary Certificate',
    });
    expect(prisma.escalation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { category: 'DOCUMENT_REQUEST' },
                { reason: { startsWith: 'HR document request:' } },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it('supports structured filtering by document type while retaining legacy fallback', async () => {
    prisma.escalation.findMany.mockResolvedValue([]);

    await service.list({ documentType: 'salary_certificate' });

    expect(prisma.escalation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                {
                  category: 'DOCUMENT_REQUEST',
                  documentType: 'salary_certificate',
                },
                {
                  reason: {
                    startsWith: 'HR document request: Salary Certificate',
                  },
                },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it('returns a structured document request by id', async () => {
    prisma.escalation.findUnique.mockResolvedValue({
      id: 'esc-1',
      category: 'DOCUMENT_REQUEST',
      documentType: 'no_objection_certificate',
      reason: 'HR document request: No Objection Certificate (NOC)',
      status: EscalationStatus.IN_PROGRESS,
      resolutionNote: null,
      createdAt: new Date('2026-08-21T10:00:00.000Z'),
      resolvedAt: null,
      employee,
      assignedHrOfficer: null,
      session: {
        ...session,
        startedAt: new Date('2026-08-21T09:00:00.000Z'),
        endedAt: null,
      },
    });

    const result = await service.getById('esc-1');

    expect(result.category).toBe('DOCUMENT_REQUEST');
    expect(result.documentType).toBe('no_objection_certificate');
    expect(result.documentLabel).toBe('No Objection Certificate (NOC)');
  });

  it('supports legacy document requests with null structured fields', async () => {
    prisma.escalation.findUnique.mockResolvedValue({
      id: 'esc-legacy',
      category: null,
      documentType: null,
      reason: 'HR document request: Salary Certificate',
      status: EscalationStatus.OPEN,
      resolutionNote: null,
      createdAt: new Date('2026-08-21T10:00:00.000Z'),
      resolvedAt: null,
      employee,
      assignedHrOfficer: null,
      session: {
        ...session,
        startedAt: new Date('2026-08-21T09:00:00.000Z'),
        endedAt: null,
      },
    });

    const result = await service.getById('esc-legacy');

    expect(result.category).toBe('DOCUMENT_REQUEST');
    expect(result.documentType).toBe('salary_certificate');
    expect(result.documentLabel).toBe('Salary Certificate');
  });

  it('does not expose a non-document escalation through the HR request endpoint', async () => {
    prisma.escalation.findUnique.mockResolvedValue({
      id: 'esc-1',
      category: null,
      documentType: null,
      reason: 'Employee needs HR assistance',
      status: EscalationStatus.OPEN,
      employee,
      assignedHrOfficer: null,
      session,
    });

    await expect(service.getById('esc-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects an invalid document type filter', async () => {
    await expect(
      service.list({ documentType: 'invalid_type' }),
    ).rejects.toThrow('Invalid documentType.');
  });
});
