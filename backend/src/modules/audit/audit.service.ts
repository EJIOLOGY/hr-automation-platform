import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

export interface CreateAuditLogInput {
  actorType: string;
  actorHrOfficerId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: CreateAuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        actorType: input.actorType,
        actorHrOfficerId: input.actorHrOfficerId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
  }
}
