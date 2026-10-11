import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { HrOfficerRole } from '../../../generated/prisma/client';
import { PayslipAuthorizationService } from '../payslip-authorization.service';

const SETTINGS_ID = 'default';
const DEFAULT_VARIANCE_THRESHOLD = 20;

// Audit metadata keys that are safe to show in the activity trail (counts and identifiers only, no pay figures).
const SAFE_ACTIVITY_KEYS = [
  'batchId',
  'dispatchId',
  'count',
  'recipientCount',
  'skippedCount',
  'mode',
  'resolution',
  'reason',
  'version',
  'approvedCount',
  'rejectedCount',
];

export class UpdatePayslipSettingsDto {
  varianceThresholdPercent!: number;
}

/**
 * Read endpoints the dashboard needs: settings, per-batch activity trail and a single payslip detail
 * (including PDF and email delivery state).
 */
@Controller('payslip')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayslipReadController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authorization: PayslipAuthorizationService,
  ) {}

  @Get('settings')
  @Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
  async getSettings() {
    const settings = await this.prisma.payslipSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    return {
      varianceThresholdPercent:
        settings?.varianceThresholdPercent ?? DEFAULT_VARIANCE_THRESHOLD,
      updatedAt: settings?.updatedAt ?? null,
    };
  }

  @Put('settings')
  @Roles(HrOfficerRole.ADMIN)
  async updateSettings(
    @Body() dto: UpdatePayslipSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const value = dto?.varianceThresholdPercent;
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new BadRequestException(
        'varianceThresholdPercent must be a whole number between 1 and 100.',
      );
    }
    const before = await this.prisma.payslipSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    const saved = await this.prisma.payslipSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        varianceThresholdPercent: value,
        updatedById: actor.id,
      },
      update: { varianceThresholdPercent: value, updatedById: actor.id },
    });
    await this.audit.log({
      actorType: 'HR_OFFICER',
      actorHrOfficerId: actor.id,
      action: 'PAYSLIP_SETTINGS_UPDATED',
      entityType: 'PAYSLIP_SETTINGS',
      entityId: SETTINGS_ID,
      metadata: {
        before: before?.varianceThresholdPercent ?? DEFAULT_VARIANCE_THRESHOLD,
        after: saved.varianceThresholdPercent,
      },
    });
    return {
      varianceThresholdPercent: saved.varianceThresholdPercent,
      updatedAt: saved.updatedAt,
    };
  }

  /**
   * GET /payslip/batches/:batchId/activity
   * Audit trail for a batch: events on the batch itself, its email dispatches, and anything whose
   * metadata names the batch. Newest first; cursor = id of the last row of the previous page.
   */
  @Get('batches/:batchId/activity')
  @Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
  async getBatchActivity(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cursor') cursor: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.authorization.assertBatch(batchId, actor);
    const take = Math.min(Math.max(limit, 1), 100);

    const dispatches = await this.prisma.payslipEmailDispatch.findMany({
      where: { payslipBatchId: batchId },
      select: { id: true },
    });
    const entityIds = [batchId, ...dispatches.map((d) => d.id)];

    const rows = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: { in: entityIds } },
          { metadata: { path: ['batchId'], equals: batchId } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        actorHrOfficer: { select: { id: true, fullName: true, role: true } },
      },
    });

    const page = rows.slice(0, take);
    return {
      items: page.map((r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        const details: Record<string, unknown> = {};
        for (const key of SAFE_ACTIVITY_KEYS) {
          const v = meta[key];
          if (
            typeof v === 'string' ||
            typeof v === 'number' ||
            typeof v === 'boolean'
          )
            details[key] = v;
        }
        return {
          id: r.id,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          createdAt: r.createdAt,
          actor: r.actorHrOfficer
            ? {
                id: r.actorHrOfficer.id,
                fullName: r.actorHrOfficer.fullName,
                role: r.actorHrOfficer.role,
              }
            : {
                id: null,
                fullName: r.actorType === 'SYSTEM' ? 'System' : r.actorType,
                role: null,
              },
          details,
        };
      }),
      nextCursor: rows.length > take ? page[page.length - 1].id : null,
    };
  }

  /**
   * GET /payslip/payslips/:payslipId
   * One payslip with its review state, PDF state and latest email delivery state.
   */
  @Get('payslips/:payslipId')
  @Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
  async getPayslipDetail(
    @Param('payslipId', new ParseUUIDPipe()) payslipId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.authorization.assertPayslip(payslipId, actor);

    const payslip = await this.prisma.payslip.findUniqueOrThrow({
      where: { id: payslipId },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            department: true,
            jobTitle: true,
            email: true,
          },
        },
        lines: true,
        pdf: {
          select: {
            status: true,
            generatedAt: true,
            expiresAt: true,
            errorMessage: true,
          },
        },
        reviewedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        deliveries: {
          where: { isTest: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            recipientMasked: true,
            recipientEmailSnapshot: true,
            deliveredAt: true,
            lastEventAt: true,
            skipReason: true,
            lastErrorMessage: true,
          },
        },
      },
    });

    const latest = payslip.deliveries[0] ?? null;
    let suppressed = false;
    const email =
      latest?.recipientEmailSnapshot ?? payslip.employee?.email ?? null;
    if (email) {
      const hit = await this.prisma.emailSuppression.findFirst({
        where: {
          emailNormalized: email.trim().toLowerCase(),
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      suppressed = Boolean(hit);
    }

    return {
      id: payslip.id,
      batchId: payslip.payslipBatchId,
      staffId: payslip.staffId,
      status: payslip.status,
      employee: payslip.employee
        ? {
            id: payslip.employee.id,
            fullName: payslip.employee.fullName,
            department: payslip.employee.department,
            jobTitle: payslip.employee.jobTitle,
            hasEmail: Boolean(payslip.employee.email),
          }
        : null,
      calculationInputs: payslip.calculationInputs,
      calculationOutputs: payslip.calculationOutputs,
      lines: payslip.lines,
      reviewNote: payslip.reviewNote,
      changedSinceReview: payslip.changedSinceReview,
      carriedForward: payslip.carriedForward,
      reviewedBy: payslip.reviewedBy,
      reviewedAt: payslip.reviewedAt,
      approvedBy: payslip.approvedBy,
      approvedAt: payslip.approvedAt,
      pdf: payslip.pdf,
      delivery: latest
        ? {
            id: latest.id,
            status: latest.status,
            recipientMasked: latest.recipientMasked,
            deliveredAt: latest.deliveredAt,
            lastEventAt: latest.lastEventAt,
            skipReason: latest.skipReason,
            lastErrorMessage: latest.lastErrorMessage,
            emailSuppressed: suppressed,
          }
        : null,
    };
  }
}
