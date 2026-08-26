import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EscalationStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../core/prisma/prisma.service';
import { HR_DOCUMENT_REQUEST_TYPES } from './dashboard-hr-requests.dto';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
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

@Injectable()
export class DashboardHrRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    status?: EscalationStatus;
    documentType?: string;
    cursor?: string;
    limit?: number;
  }) {
    const limit = this.normalizeLimit(query.limit);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const documentType = query.documentType
      ? this.resolveDocumentType(query.documentType)
      : undefined;

    const rows = await this.prisma.escalation.findMany({
      where: {
        category: 'DOCUMENT_REQUEST',
        ...(query.status ? { status: query.status } : {}),
        ...(documentType ? { documentType: documentType.id } : {}),
        AND: [
          ...(cursor
            ? [
                {
                  OR: [
                    { createdAt: { lt: new Date(cursor.createdAt) } },
                    {
                      createdAt: new Date(cursor.createdAt),
                      id: { lt: cursor.id },
                    },
                  ],
                },
              ]
            : []),
        ],
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
    const escalation = await this.prisma.escalation.findFirst({
      where: { id, category: 'DOCUMENT_REQUEST' },
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

    if (!escalation) {
      throw new NotFoundException('HR document request not found.');
    }

    return this.toView(escalation);
  }

  private toView(row: any) {
    const structured = this.findDocumentType(row.documentType);

    return {
      id: row.id,
      category: row.category,
      documentType: row.documentType,
      documentLabel: structured?.label ?? null,
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

  private findDocumentType(value?: string | null) {
    if (!value) return undefined;
    return DOCUMENT_TYPES.find((type) => type.id === value);
  }

  private resolveDocumentType(value: string) {
    const normalized = value.trim().toLowerCase();
    const documentType = DOCUMENT_TYPES.find((type) => type.id === normalized);

    if (!documentType || !HR_DOCUMENT_REQUEST_TYPES.includes(documentType.id as (typeof HR_DOCUMENT_REQUEST_TYPES)[number])) {
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
