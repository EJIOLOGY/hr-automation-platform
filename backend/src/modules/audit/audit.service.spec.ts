import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;

  const prismaMock = {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create an audit log', async () => {
    const auditLog = {
      id: 'audit-1',
      actorType: 'HR_OFFICER',
      actorHrOfficerId: 'officer-1',
      action: 'ESCALATION_CLAIMED',
      entityType: 'ESCALATION',
      entityId: 'escalation-1',
      metadata: {
        source: 'dashboard',
      },
    };

    prismaMock.auditLog.create.mockResolvedValue(auditLog);

    await expect(
      service.log({
        actorType: 'HR_OFFICER',
        actorHrOfficerId: 'officer-1',
        action: 'ESCALATION_CLAIMED',
        entityType: 'ESCALATION',
        entityId: 'escalation-1',
        metadata: {
          source: 'dashboard',
        },
      }),
    ).resolves.toEqual(auditLog);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorType: 'HR_OFFICER',
        actorHrOfficerId: 'officer-1',
        action: 'ESCALATION_CLAIMED',
        entityType: 'ESCALATION',
        entityId: 'escalation-1',
        metadata: {
          source: 'dashboard',
        },
      },
    });
  });

  it('should list audit logs with deterministic ordering and sanitized metadata', async () => {
    const createdAt = new Date('2026-03-01T10:00:00.000Z');
    const mockRow = {
      id: 'log-1',
      actorType: 'HR_OFFICER',
      action: 'ESCALATION_CLAIMED',
      entityType: 'ESCALATION',
      entityId: 'esc-123',
      createdAt,
      metadata: {
        safeField: 'value123',
        passwordHash: 'secretHash',
        token: 'sensitiveToken',
      },
      actorHrOfficer: {
        id: 'officer-1',
        fullName: 'Jane Officer',
        email: 'jane@example.com',
        role: 'ADMIN',
      },
    };

    prismaMock.auditLog.findMany.mockResolvedValue([mockRow]);

    const result = await service.list({ limit: 10 });

    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 11,
      }),
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      id: 'log-1',
      actorType: 'HR_OFFICER',
      actor: {
        id: 'officer-1',
        fullName: 'Jane Officer',
        email: 'jane@example.com',
        role: 'ADMIN',
      },
      action: 'ESCALATION_CLAIMED',
      entityType: 'ESCALATION',
      entityId: 'esc-123',
      createdAt: createdAt.toISOString(),
      metadata: {
        safeField: 'value123',
      },
    });
    expect(result.items[0].metadata).not.toHaveProperty('passwordHash');
    expect(result.items[0].metadata).not.toHaveProperty('token');
    expect(result.nextCursor).toBeNull();
  });

  it('should generate nextCursor when more records exist', async () => {
    const d1 = new Date('2026-03-01T10:00:00.000Z');
    const d2 = new Date('2026-03-01T09:00:00.000Z');

    const row1 = {
      id: 'log-1',
      actorType: 'SYSTEM',
      action: 'LOGIN',
      entityType: 'SESSION',
      entityId: 's-1',
      createdAt: d1,
      metadata: null,
      actorHrOfficer: null,
    };
    const row2 = {
      id: 'log-2',
      actorType: 'SYSTEM',
      action: 'LOGIN',
      entityType: 'SESSION',
      entityId: 's-2',
      createdAt: d2,
      metadata: null,
      actorHrOfficer: null,
    };

    // Requested limit 1, returning 2 rows means hasMore = true
    prismaMock.auditLog.findMany.mockResolvedValue([row1, row2]);

    const result = await service.list({ limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('log-1');
    expect(result.nextCursor).toBeTruthy();
  });
});
