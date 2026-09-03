import { BadRequestException, Injectable } from '@nestjs/common';
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

export interface AuditLogListQuery {
  limit?: number;
  cursor?: string;
}

export interface AuditLogActorView {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

export interface AuditLogView {
  id: string;
  actorType: string;
  actor: AuditLogActorView | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

interface AuditLogCursor {
  createdAt: string;
  id: string;
}

type AuditLogRow = Prisma.AuditLogGetPayload<{
  include: {
    actorHrOfficer: {
      select: {
        id: true;
        fullName: true;
        email: true;
        role: true;
      };
    };
  };
}>;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

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

  async list(query: AuditLogListQuery = {}) {
    const limit = this.normalizeLimit(query.limit);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;

    const rows = await this.prisma.auditLog.findMany({
      where: cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              {
                createdAt: new Date(cursor.createdAt),
                id: { lt: cursor.id },
              },
            ],
          }
        : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        actorHrOfficer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => this.toView(row));
    const last =
      rows.length > 0 ? rows[Math.min(limit, rows.length) - 1] : undefined;

    return {
      items,
      nextCursor:
        hasMore && last
          ? this.encodeCursor({
              createdAt: last.createdAt.toISOString(),
              id: last.id,
            })
          : null,
    };
  }

  private toView(row: AuditLogRow): AuditLogView {
    return {
      id: row.id,
      actorType: row.actorType,
      actor: row.actorHrOfficer
        ? {
            id: row.actorHrOfficer.id,
            fullName: row.actorHrOfficer.fullName,
            email: row.actorHrOfficer.email,
            role: row.actorHrOfficer.role,
          }
        : null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      createdAt: row.createdAt.toISOString(),
      metadata: this.sanitizeMetadata(row.metadata),
    };
  }

  private sanitizeMetadata(metadata: unknown): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }
    const SENSITIVE =
      /password|token|hash|secret|credential|cookie|authorization/i;
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      metadata as Record<string, unknown>,
    )) {
      if (!SENSITIVE.test(key)) {
        sanitized[key] = value;
      }
    }
    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }

  private normalizeLimit(value?: number): number {
    if (value === undefined || value === null) return DEFAULT_LIMIT;
    if (!Number.isInteger(value) || value < 1) {
      throw new BadRequestException('limit must be a positive integer.');
    }
    return Math.min(value, MAX_LIMIT);
  }

  private encodeCursor(cursor: AuditLogCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(value: string): AuditLogCursor {
    try {
      const decoded = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as Partial<AuditLogCursor>;

      if (
        typeof decoded.id !== 'string' ||
        typeof decoded.createdAt !== 'string' ||
        Number.isNaN(new Date(decoded.createdAt).getTime())
      ) {
        throw new Error('Invalid cursor');
      }

      return { id: decoded.id, createdAt: decoded.createdAt };
    } catch {
      throw new BadRequestException('Invalid pagination cursor.');
    }
  }
}
