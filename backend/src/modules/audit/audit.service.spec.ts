import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;

  const prismaMock = {
    auditLog: {
      create: jest.fn(),
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
});
