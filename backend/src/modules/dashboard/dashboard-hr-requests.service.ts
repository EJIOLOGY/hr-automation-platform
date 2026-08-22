import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EscalationStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../core/prisma/prisma.service';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const DOCUMENT_REQUEST_PREFIX = 'HR document request:';

const DOCUMENT_TYPES = [
  {
    id: 'employment_verification_letter',
    label: 'Employment Verification Letter (EVL)',
  },
  { id: 'salary_certificate', label: 'Salary Certificate' },
  {
    id: 'no_objection_certificate',
    label: 'No Objection Certificate (NOC)',
  },
  { id: 'other_hr_document', label: 'Other HR Document' },
] as const;

interface HrRequestCursor {
  createdAt: string;
  id: string;
}

export interface HrRequestListQuery {
  status?: EscalationStatus;
  documentType?: string;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class DashboardHrRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: HrRequestListQuery) {
    const limit = this.normalizeLimit(query.limit);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const documentType = query.documentType
      ? this.resolveDocumentType(query.documentType)
      : undefined;

    const rows = await this.prisma.escalation.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        reason: documentType
          ? { startsWith: `${DOCUMENT_REQUEST_PREFIX} ${documentType.label}` }
          : { startsWith: DOCUMENT_REQUEST_PREFIX },
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                {
                  createdAt: new Date(cursor.createdAt),
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            phoneNumber: true,
            department: true,
            jobTitle: true,
            status: true,
          },
        },
        assignedHrOfficer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        session: {
          select: {
            id: true,
            currentState: true,
            isActive: true,
            lastActivityAt: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => this.toView(row));
    const last = rows.length > 0 ? rows[Math.min(limit, rows.length) - 1] : undefined;

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

  async getById(id: string) {
    const escalation = await this.prisma.escalation.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            phoneNumber: true,
            department: true,
            jobTitle: true,
            status: true,
          },
        },
        assignedHrOfficer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        session: {
          select: {
            id: true,
            currentState: true,
            isActive: true,
            startedAt: true,
            lastActivityAt: true,
            endedAt: true,
          },
        },
      },
    });

    if (!escalation || !this.isDocumentRequest(escalation.reason)) {
      throw new NotFoundException('HR document request not found.');
    }

    return this.toView(escalation);
  }

  private toView(row: any) {
    const derived = this.parseDocumentType(row.reason);

    return {
      id: row.id,
      category: row.category ?? 'DOCUMENT_REQUEST',
      documentType: row.documentType ?? derived?.id ?? null,
      documentLabel: derived?.label ?? row.documentType ?? 'Other HR Document',
      reason: row.reason,
      status: row.status,
      resolutionNote: row.resolutionNote,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
      employee: row.employee,
      assignedHrOfficer: row.assignedHrOfficer,
      session: row.session,
    };
  }

  private isDocumentRequest(reason: string) {
    return reason.trim().startsWith(DOCUMENT_REQUEST_PREFIX);
  }

  private parseDocumentType(reason: string) {
    const value = reason.trim().slice(DOCUMENT_REQUEST_PREFIX.length).trim();
    return DOCUMENT_TYPES.find((type) => type.label === value);
  }

  private resolveDocumentType(value: string) {
    const normalized = value.trim().toLowerCase();
    const documentType = DOCUMENT_TYPES.find(
      (type) => type.id === normalized || type.label.toLowerCase() === normalized,
    );

    if (!documentType) {
      throw new BadRequestException('Invalid documentType.');
    }

    return documentType;
  }

  private normalizeLimit(value?: number) {
    if (value === undefined) return DEFAULT_LIMIT;
    if (!Number.isInteger(value) || value < 1) {
      throw new BadRequestException('limit must be a positive integer.');
    }
    return Math.min(value, MAX_LIMIT);
  }

  private encodeCursor(cursor: HrRequestCursor) {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(value: string): HrRequestCursor {
    try {
      const decoded = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as Partial<HrRequestCursor>;

      if (
        typeof decoded.id !== 'string' ||
        typeof decoded.createdAt !== 'string' ||
        Number.isNaN(new Date(decoded.createdAt).getTime())
      ) {
        throw new Error('Invalid cursor');
      }

      return { id: decoded.id, createdAt: decoded.createdAt };
    } catch {
      throw new BadRequestException('Invalid cursor.');
    }
  }
}
