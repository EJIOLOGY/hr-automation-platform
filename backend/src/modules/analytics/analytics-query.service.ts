import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AnalyticsEventType,
  MessageDirection,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AnalyticsQueryDto } from './analytics-query.dto';
import type {
  AnalyticsOverview,
  ConversationActivity,
  ConversationActivityPoint,
  EscalationAnalytics,
  HrServicesAnalytics,
  JourneyAnalytics,
  TopPathsAnalytics,
  UnrecognizedInputsAnalytics,
} from './analytics-query.types';

interface NormalizedAnalyticsQuery {
  from?: Date;
  toExclusive?: Date;
  department?: string;
}

const JOURNEY_STEPS: ReadonlyArray<{
  type: AnalyticsEventType;
  label: string;
}> = [
  { type: AnalyticsEventType.SESSION_STARTED, label: 'Started Conversation' },
  { type: AnalyticsEventType.MAIN_MENU_VIEWED, label: 'Main Menu Viewed' },
  { type: AnalyticsEventType.SERVICE_SELECTED, label: 'HR Service Selected' },
  {
    type: AnalyticsEventType.INFORMATION_PROVIDED,
    label: 'Information Provided',
  },
  { type: AnalyticsEventType.BOT_COMPLETED, label: 'Completed (Bot)' },
  { type: AnalyticsEventType.ESCALATION_CREATED, label: 'Escalated to HR' },
];

@Injectable()
export class AnalyticsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: AnalyticsQueryDto): Promise<AnalyticsOverview> {
    const normalized = this.normalizeQuery(query);
    const sessionWhere = this.sessionWhere(normalized);
    const escalationWhere = this.escalationWhere(normalized);
    const eventWhere = this.eventWhere(normalized);

    const [
      totalConversations,
      employeeSessions,
      hrEscalations,
      startedEvents,
      completedEvents,
    ] = await Promise.all([
      this.prisma.chatSession.count({
        where: sessionWhere,
      }),
      this.prisma.chatSession.groupBy({
        by: ['employeeId'],
        where: sessionWhere,
      }),
      this.prisma.escalation.count({
        where: escalationWhere,
      }),
      this.prisma.analyticsEvent.count({
        where: {
          ...eventWhere,
          type: AnalyticsEventType.SESSION_STARTED,
        },
      }),
      this.prisma.analyticsEvent.count({
        where: {
          ...eventWhere,
          type: AnalyticsEventType.BOT_COMPLETED,
        },
      }),
    ]);

    const activeEmployees = employeeSessions.length;

    return {
      totalConversations,
      activeEmployees,
      botResolutionRate:
        startedEvents === 0
          ? null
          : this.percentage(completedEvents, startedEvents),
      escalationRate:
        totalConversations === 0
          ? null
          : this.percentage(hrEscalations, totalConversations),
      averageFirstResponseSeconds:
        await this.getAverageFirstResponseSeconds(sessionWhere),
      hrEscalations,
    };
  }

  async getConversationActivity(
    query: AnalyticsQueryDto,
  ): Promise<ConversationActivity> {
    const normalized = this.normalizeQuery(query);

    const [sessions, completedEvents, escalations] = await Promise.all([
      this.prisma.chatSession.findMany({
        where: this.sessionWhere(normalized),
        select: {
          startedAt: true,
        },
      }),
      this.prisma.analyticsEvent.findMany({
        where: {
          ...this.eventWhere(normalized),
          type: AnalyticsEventType.BOT_COMPLETED,
        },
        select: {
          createdAt: true,
        },
      }),
      this.prisma.escalation.findMany({
        where: this.escalationWhere(normalized),
        select: {
          createdAt: true,
        },
      }),
    ]);

    return {
      daily: this.buildActivityPoints(
        sessions,
        completedEvents,
        escalations,
        'day',
      ),
      weekly: this.buildActivityPoints(
        sessions,
        completedEvents,
        escalations,
        'week',
      ),
      monthly: this.buildActivityPoints(
        sessions,
        completedEvents,
        escalations,
        'month',
      ),
    };
  }

  getHrServices(query: AnalyticsQueryDto): HrServicesAnalytics {
    this.normalizeQuery(query);

    return {
      dataAvailable: false,
      items: [],
    };
  }

  async getJourney(query: AnalyticsQueryDto): Promise<JourneyAnalytics> {
    const normalized = this.normalizeQuery(query);

    const counts = await this.prisma.analyticsEvent.groupBy({
      by: ['type'],
      where: this.eventWhere(normalized),
      _count: {
        id: true,
      },
    });

    const countByType = new Map(
      counts.map((item) => [item.type, item._count.id]),
    );

    return {
      steps: JOURNEY_STEPS.map((step) => ({
        type: step.type,
        label: step.label,
        count: countByType.get(step.type) ?? 0,
      })),
    };
  }

  async getEscalations(query: AnalyticsQueryDto): Promise<EscalationAnalytics> {
    const normalized = this.normalizeQuery(query);
    const where = this.escalationWhere(normalized);

    const [total, categories] = await Promise.all([
      this.prisma.escalation.count({
        where,
      }),
      this.prisma.escalation.groupBy({
        by: ['category'],
        where,
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
      }),
    ]);

    return {
      total,
      averagePerDay: this.averagePerDay(total, normalized),
      categories: categories.map((item) => ({
        category: item.category,
        count: item._count.id,
      })),
    };
  }

  getTopPaths(query: AnalyticsQueryDto): TopPathsAnalytics {
    this.normalizeQuery(query);

    return {
      dataAvailable: false,
      items: [],
    };
  }

  async getUnrecognizedInputs(
    query: AnalyticsQueryDto,
  ): Promise<UnrecognizedInputsAnalytics> {
    const normalized = this.normalizeQuery(query);

    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        ...this.eventWhere(normalized),
        type: AnalyticsEventType.UNRECOGNIZED_INPUT,
      },
      select: {
        id: true,
        sessionId: true,
        employeeId: true,
        createdAt: true,
        reviewedAt: true,
        employee: {
          select: {
            department: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      items: events.map((event) => ({
        id: event.id,
        sessionId: event.sessionId,
        employeeId: event.employeeId,
        department: event.employee?.department ?? null,
        occurredAt: event.createdAt.toISOString(),
        reviewedAt: event.reviewedAt?.toISOString() ?? null,
      })),
    };
  }

  async reviewUnrecognizedInput(id: string): Promise<void> {
    const event = await this.prisma.analyticsEvent.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        type: true,
      },
    });

    if (!event || event.type !== AnalyticsEventType.UNRECOGNIZED_INPUT) {
      throw new NotFoundException('Unrecognized input event not found.');
    }

    await this.prisma.analyticsEvent.update({
      where: {
        id,
      },
      data: {
        reviewedAt: new Date(),
      },
    });
  }

  async getExport(query: AnalyticsQueryDto): Promise<string> {
    const services = this.getHrServices(query);

    const [overview, journey, escalations] = await Promise.all([
      this.getOverview(query),
      this.getJourney(query),
      this.getEscalations(query),
    ]);

    const rows: string[][] = [
      ['Section', 'Metric', 'Value'],
      ['Overview', 'Total Conversations', String(overview.totalConversations)],
      ['Overview', 'Active Employees', String(overview.activeEmployees)],
      [
        'Overview',
        'Bot Resolution Rate',
        this.formatNullableNumber(overview.botResolutionRate),
      ],
      [
        'Overview',
        'Escalation Rate',
        this.formatNullableNumber(overview.escalationRate),
      ],
      [
        'Overview',
        'Average First Response Seconds',
        this.formatNullableNumber(overview.averageFirstResponseSeconds),
      ],
      ['Overview', 'HR Escalations', String(overview.hrEscalations)],
      ['HR Services', 'Data Available', String(services.dataAvailable)],
      ...journey.steps.map((step) => [
        'Journey',
        step.label,
        String(step.count),
      ]),
      ['Escalations', 'Total', String(escalations.total)],
      [
        'Escalations',
        'Average Per Day',
        this.formatNullableNumber(escalations.averagePerDay),
      ],
      ...escalations.categories.map((category) => [
        'Escalations',
        category.category ?? 'Uncategorised',
        String(category.count),
      ]),
    ];

    return rows
      .map((row) => row.map((value) => this.escapeCsv(value)).join(','))
      .join('\r\n');
  }

  private normalizeQuery(query: AnalyticsQueryDto): NormalizedAnalyticsQuery {
    if (query.service?.trim()) {
      throw new BadRequestException(
        'The service filter is not available until analytics event service metadata is defined.',
      );
    }

    const from = query.from
      ? this.parseDateBoundary(query.from, false)
      : undefined;

    const toExclusive = query.to
      ? this.parseDateBoundary(query.to, true)
      : undefined;

    if (from && toExclusive && from >= toExclusive) {
      throw new BadRequestException('from must be before to.');
    }

    const department = query.department?.trim();

    return {
      from,
      toExclusive,
      department: department || undefined,
    };
  }

  private parseDateBoundary(value: string, isEnd: boolean): Date {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);

    const date = dateOnly
      ? new Date(`${value}T00:00:00.000Z`)
      : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date filter.');
    }

    if (!isEnd) {
      return date;
    }

    return dateOnly
      ? new Date(date.getTime() + 24 * 60 * 60 * 1000)
      : new Date(date.getTime() + 1);
  }

  private sessionWhere(
    query: NormalizedAnalyticsQuery,
  ): Prisma.ChatSessionWhereInput {
    return {
      ...(this.dateRange(query)
        ? {
            startedAt: this.dateRange(query),
          }
        : {}),
      ...(query.department
        ? {
            employee: {
              department: query.department,
            },
          }
        : {}),
    };
  }

  private escalationWhere(
    query: NormalizedAnalyticsQuery,
  ): Prisma.EscalationWhereInput {
    return {
      ...(this.dateRange(query)
        ? {
            createdAt: this.dateRange(query),
          }
        : {}),
      ...(query.department
        ? {
            employee: {
              department: query.department,
            },
          }
        : {}),
    };
  }

  private eventWhere(
    query: NormalizedAnalyticsQuery,
  ): Prisma.AnalyticsEventWhereInput {
    return {
      ...(this.dateRange(query)
        ? {
            createdAt: this.dateRange(query),
          }
        : {}),
      ...(query.department
        ? {
            employee: {
              department: query.department,
            },
          }
        : {}),
    };
  }

  private dateRange(query: NormalizedAnalyticsQuery) {
    if (!query.from && !query.toExclusive) {
      return undefined;
    }

    return {
      ...(query.from
        ? {
            gte: query.from,
          }
        : {}),
      ...(query.toExclusive
        ? {
            lt: query.toExclusive,
          }
        : {}),
    };
  }

  private async getAverageFirstResponseSeconds(
    sessionWhere: Prisma.ChatSessionWhereInput,
  ): Promise<number | null> {
    const escalations = await this.prisma.escalation.findMany({
      where: {
        session: sessionWhere,
      },
      select: {
        sessionId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (escalations.length === 0) {
      return null;
    }

    const responseDurations: number[] = [];

    for (const escalation of escalations) {
      const firstHrMessage = await this.prisma.chatMessage.findFirst({
        where: {
          sessionId: escalation.sessionId,
          direction: MessageDirection.OUTBOUND,
          sentByHrOfficerId: {
            not: null,
          },
          createdAt: {
            gte: escalation.createdAt,
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          createdAt: true,
        },
      });

      if (!firstHrMessage) {
        continue;
      }

      responseDurations.push(
        (firstHrMessage.createdAt.getTime() - escalation.createdAt.getTime()) /
          1000,
      );
    }

    if (responseDurations.length === 0) {
      return null;
    }

    return Number(
      (
        responseDurations.reduce((sum, value) => sum + value, 0) /
        responseDurations.length
      ).toFixed(2),
    );
  }

  private buildActivityPoints(
    sessions: ReadonlyArray<{ startedAt: Date }>,
    completedEvents: ReadonlyArray<{ createdAt: Date }>,
    escalations: ReadonlyArray<{ createdAt: Date }>,
    granularity: 'day' | 'week' | 'month',
  ): ConversationActivityPoint[] {
    const points = new Map<string, ConversationActivityPoint>();

    const increment = (
      date: Date,
      field: keyof Omit<ConversationActivityPoint, 'label'>,
    ) => {
      const label = this.activityLabel(date, granularity);

      const point = points.get(label) ?? {
        label,
        conversations: 0,
        completed: 0,
        escalated: 0,
      };

      point[field] += 1;
      points.set(label, point);
    };

    sessions.forEach((session) =>
      increment(session.startedAt, 'conversations'),
    );

    completedEvents.forEach((event) => increment(event.createdAt, 'completed'));

    escalations.forEach((escalation) =>
      increment(escalation.createdAt, 'escalated'),
    );

    return [...points.values()].sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }

  private activityLabel(date: Date, granularity: 'day' | 'week' | 'month') {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');

    const day = String(date.getUTCDate()).padStart(2, '0');

    if (granularity === 'month') {
      return `${year}-${month}`;
    }

    if (granularity === 'day') {
      return `${year}-${month}-${day}`;
    }

    const weekStart = new Date(
      Date.UTC(year, date.getUTCMonth(), date.getUTCDate()),
    );

    const offset = (weekStart.getUTCDay() + 6) % 7;

    weekStart.setUTCDate(weekStart.getUTCDate() - offset);

    return weekStart.toISOString().slice(0, 10);
  }

  private averagePerDay(total: number, query: NormalizedAnalyticsQuery) {
    if (!query.from || !query.toExclusive) {
      return null;
    }

    const days =
      (query.toExclusive.getTime() - query.from.getTime()) / 86_400_000;

    return days > 0 ? Number((total / days).toFixed(2)) : null;
  }

  private percentage(numerator: number, denominator: number) {
    return Number(((numerator / denominator) * 100).toFixed(2));
  }

  private formatNullableNumber(value: number | null) {
    return value === null ? '' : String(value);
  }

  private escapeCsv(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }
}
