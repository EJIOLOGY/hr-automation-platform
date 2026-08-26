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
        findFirst: jest.fn(),
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
        where: expect.objectContaining({ category: 'DOCUMENT_REQUEST' }),
      }),
    );
  });

  it('returns multiple document request types while excluding general escalations in the database query', async () => {
    prisma.escalation.findMany.mockResolvedValue([
      {
        id: 'esc-salary',
        category: 'DOCUMENT_REQUEST',
        documentType: 'salary_certificate',
        reason: 'HR document request: Salary Certificate',
        status: EscalationStatus.OPEN,
        resolutionNote: null,
        createdAt: new Date('2026-08-21T11:00:00.000Z'),
        resolvedAt: null,
        employee,
        assignedHrOfficer: null,
        session,
      },
      {
        id: 'esc-noc',
        category: 'DOCUMENT_REQUEST',
        documentType: 'no_objection_certificate',
        reason: 'HR document request: No Objection Certificate (NOC)',
        status: EscalationStatus.OPEN,
        resolutionNote: null,
        createdAt: new Date('2026-08-21T10:00:00.000Z'),
        resolvedAt: null,
        employee,
        assignedHrOfficer: null,
        session,
      },
    ]);

    const result = await service.list({});

    expect(result.items.map((item) => item.documentType)).toEqual([
      'salary_certificate',
      'no_objection_certificate',
    ]);
    expect(prisma.escalation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: 'DOCUMENT_REQUEST' }),
      }),
    );
  });

  it('filters only document requests by document type', async () => {
    prisma.escalation.findMany.mockResolvedValue([]);

    await service.list({ documentType: 'salary_certificate' });

    expect(prisma.escalation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: 'DOCUMENT_REQUEST',
          documentType: 'salary_certificate',
        }),
      }),
    );
  });

  it('returns a structured document request by id', async () => {
    prisma.escalation.findFirst.mockResolvedValue({
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

  it('does not expose a non-document escalation through the HR request endpoint', async () => {
    prisma.escalation.findFirst.mockResolvedValue(null);

    await expect(service.getById('esc-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.escalation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'esc-1', category: 'DOCUMENT_REQUEST' },
      }),
    );
  });

  it('applies status and document type filters together', async () => {
    prisma.escalation.findMany.mockResolvedValue([]);

    await service.list({
      status: EscalationStatus.OPEN,
      documentType: 'no_objection_certificate',
    });

    expect(prisma.escalation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: 'DOCUMENT_REQUEST',
          status: EscalationStatus.OPEN,
          documentType: 'no_objection_certificate',
        }),
      }),
    );
  });

  it('uses a stable cursor for pagination', async () => {
    prisma.escalation.findMany.mockResolvedValue([]);
    const cursor = Buffer.from(
      JSON.stringify({ id: 'esc-1', createdAt: '2026-08-21T10:00:00.000Z' }),
    ).toString('base64url');

    await service.list({ cursor, limit: 10 });

    expect(prisma.escalation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 11,
        where: expect.objectContaining({ category: 'DOCUMENT_REQUEST' }),
      }),
    );
  });

  it('rejects an invalid document type filter', async () => {
    await expect(
      service.list({ documentType: 'invalid_type' }),
    ).rejects.toThrow('Invalid documentType.');
  });
});
