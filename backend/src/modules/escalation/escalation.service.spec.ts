import { EscalationStatus } from '../../generated/prisma/enums';
import { EscalationService } from './escalation.service';

describe('EscalationService', () => {
  let service: EscalationService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      escalation: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new EscalationService(prisma);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a structured document request when no matching active request exists', async () => {
    prisma.escalation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.escalation.create.mockResolvedValue({ id: 'esc-doc-1' });
    prisma.escalation.findUnique.mockResolvedValue({
      id: 'esc-doc-1',
      status: EscalationStatus.IN_PROGRESS,
      createdAt: new Date('2026-08-22T06:00:00.000Z'),
    });
    prisma.escalation.count.mockResolvedValue(1);

    const result = await service.createOrGetActiveEscalation(
      'emp-1',
      'session-1',
      'HR document request: Salary Certificate',
      {
        category: 'DOCUMENT_REQUEST',
        documentType: 'salary_certificate',
      },
    );

    expect(prisma.escalation.create).toHaveBeenCalledWith({
      data: {
        employeeId: 'emp-1',
        sessionId: 'session-1',
        reason: 'HR document request: Salary Certificate',
        status: EscalationStatus.IN_PROGRESS,
        category: 'DOCUMENT_REQUEST',
        documentType: 'salary_certificate',
      },
    });
    expect(result.escalationId).toBe('esc-doc-1');
  });

  it('reuses the same active document request instead of creating a duplicate', async () => {
    const existing = {
      id: 'esc-doc-existing',
      status: EscalationStatus.OPEN,
      createdAt: new Date('2026-08-22T06:00:00.000Z'),
    };

    prisma.escalation.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(null);
    prisma.escalation.findUnique.mockResolvedValue(existing);
    prisma.escalation.count.mockResolvedValue(0);

    const result = await service.createOrGetActiveEscalation(
      'emp-1',
      'session-2',
      'HR document request: Salary Certificate',
      {
        category: 'DOCUMENT_REQUEST',
        documentType: 'salary_certificate',
      },
    );

    expect(prisma.escalation.create).not.toHaveBeenCalled();
    expect(prisma.escalation.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      escalationId: 'esc-doc-existing',
      status: EscalationStatus.OPEN,
      queuePosition: 1,
      hrBusy: false,
    });
  });

  it('does not reuse an unrelated active Talk to HR escalation for a document request', async () => {
    const unrelated = {
      id: 'esc-talk-to-hr',
      status: EscalationStatus.IN_PROGRESS,
      category: null,
      documentType: null,
      createdAt: new Date('2026-08-22T06:00:00.000Z'),
    };

    prisma.escalation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(unrelated);
    prisma.escalation.create.mockResolvedValue({ id: 'esc-doc-new' });
    prisma.escalation.findUnique.mockResolvedValue({
      id: 'esc-doc-new',
      status: EscalationStatus.OPEN,
      createdAt: new Date('2026-08-22T06:05:00.000Z'),
    });
    prisma.escalation.count.mockResolvedValue(1);

    const result = await service.createOrGetActiveEscalation(
      'emp-1',
      'session-3',
      'HR document request: No Objection Certificate (NOC)',
      {
        category: 'DOCUMENT_REQUEST',
        documentType: 'no_objection_certificate',
      },
    );

    expect(prisma.escalation.create).toHaveBeenCalledWith({
      data: {
        employeeId: 'emp-1',
        sessionId: 'session-3',
        reason: 'HR document request: No Objection Certificate (NOC)',
        status: EscalationStatus.OPEN,
        category: 'DOCUMENT_REQUEST',
        documentType: 'no_objection_certificate',
      },
    });
    expect(result.escalationId).toBe('esc-doc-new');
  });

  it('does not reuse a different active document type for a new document request', async () => {
    prisma.escalation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.escalation.create.mockResolvedValue({ id: 'esc-doc-new' });
    prisma.escalation.findUnique.mockResolvedValue({
      id: 'esc-doc-new',
      status: EscalationStatus.IN_PROGRESS,
      createdAt: new Date('2026-08-22T06:10:00.000Z'),
    });
    prisma.escalation.count.mockResolvedValue(1);

    await service.createOrGetActiveEscalation(
      'emp-1',
      'session-4',
      'HR document request: Employment Verification Letter (EVL)',
      {
        category: 'DOCUMENT_REQUEST',
        documentType: 'employment_verification_letter',
      },
    );

    expect(prisma.escalation.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        employeeId: 'emp-1',
        status: {
          in: [EscalationStatus.OPEN, EscalationStatus.IN_PROGRESS],
        },
        category: 'DOCUMENT_REQUEST',
        documentType: 'employment_verification_letter',
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  });

  it('retains employee-level reuse for a general HR escalation', async () => {
    const existing = {
      id: 'esc-hr',
      status: EscalationStatus.OPEN,
      createdAt: new Date('2026-08-22T06:00:00.000Z'),
    };

    prisma.escalation.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(null);
    prisma.escalation.findUnique.mockResolvedValue(existing);
    prisma.escalation.count.mockResolvedValue(0);

    const result = await service.createOrGetActiveEscalation(
      'emp-1',
      'session-5',
      'Employee needs HR assistance',
    );

    expect(prisma.escalation.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        employeeId: 'emp-1',
        status: {
          in: [EscalationStatus.OPEN, EscalationStatus.IN_PROGRESS],
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
    expect(prisma.escalation.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      escalationId: 'esc-hr',
      status: EscalationStatus.OPEN,
      queuePosition: 1,
      hrBusy: false,
    });
  });
});
