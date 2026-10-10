import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipAuthorizationService } from '../payslip-authorization.service';
import { PayslipEmailSenderService } from './payslip-email-sender.service';
import { PayslipDeliveryWorkerService } from './payslip-delivery-worker.service';
import { payslipError } from '../shared/payslip-error-codes';
import {
  EmailSuppressionStatus,
  HrOfficerRole,
  PayslipDeliveryAttemptTrigger,
  PayslipDeliveryStatus,
  PayslipEmailDispatchMode,
  PayslipEmailDispatchStatus,
  PayslipStatus,
} from '../../../generated/prisma/client';
import { maskEmail, normalizeEmail } from '../../employee/email-utils';

export class CreateDispatchDto {
  mode?: PayslipEmailDispatchMode;
  includeCarriedForward?: boolean;
}

export class PauseDispatchDto {
  reason?: string;
}

@Controller('payslip/batches')
@UseGuards(JwtAuthGuard)
export class PayslipEmailDispatchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly authService: PayslipAuthorizationService,
    private readonly sender: PayslipEmailSenderService,
    private readonly worker: PayslipDeliveryWorkerService,
  ) {}

  /**
   * POST /payslip/batches/:batchId/email-dispatch
   * Creates a new dispatch draft in PENDING_APPROVAL status.
   */
  @Post(':batchId/email-dispatch')
  @HttpCode(HttpStatus.CREATED)
  async createDispatch(
    @Param('batchId') batchId: string,
    @Body() dto: CreateDispatchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const batch = await this.authService.assertBatch(batchId, actor);

    // Batch must be in APPROVED state
    const batchRecord = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
      include: {
        payrollPeriod: true,
      },
    });

    if (!batchRecord) {
      throw new NotFoundException('Batch not found.');
    }

    const mode = dto.mode || PayslipEmailDispatchMode.LIVE;
    const includeCarriedForward = dto.includeCarriedForward ?? false;

    // Fetch approved payslips in this batch
    const payslips = await this.prisma.payslip.findMany({
      where: {
        payslipBatchId: batchId,
        status: PayslipStatus.APPROVED,
        ...(includeCarriedForward ? {} : { carriedForward: false }),
      },
      include: {
        employee: true,
      },
    });

    if (payslips.length === 0) {
      throw payslipError(HttpStatus.BAD_REQUEST, 'NOTHING_TO_APPROVE', 'No approved payslips found for this batch.');
    }

    // Check suppression list to partition recipients vs skipped
    const allEmails = payslips
      .map((p) => p.employee?.email)
      .filter((e): e is string => Boolean(e))
      .map((e) => normalizeEmail(e));

    const activeSuppressions = await this.prisma.emailSuppression.findMany({
      where: {
        emailNormalized: { in: allEmails },
        status: EmailSuppressionStatus.ACTIVE,
      },
      select: { emailNormalized: true },
    });
    const suppressedSet = new Set(activeSuppressions.map((s) => s.emailNormalized));

    let recipientCount = 0;
    let skippedCount = 0;

    const deliveryInputs = [];

    for (const payslip of payslips) {
      const email = payslip.employee?.email ? normalizeEmail(payslip.employee.email) : null;
      const isSuppressed = email ? suppressedSet.has(email) : false;
      const isSkipped = !email || isSuppressed;

      if (isSkipped) {
        skippedCount++;
      } else {
        recipientCount++;
      }

      deliveryInputs.push({
        payslipId: payslip.id,
        payslipBatchId: batchId,
        accountingCompanyId: batchRecord.accountingCompanyId,
        payrollPeriodId: batchRecord.payrollPeriodId,
        employeeId: payslip.employeeId,
        isTest: mode === PayslipEmailDispatchMode.TEST,
        status: isSkipped ? PayslipDeliveryStatus.SKIPPED : PayslipDeliveryStatus.PENDING,
        skipReason: !email
          ? 'Missing employee email'
          : isSuppressed
          ? 'Email address is on the active suppression list'
          : null,
        recipientEmailSnapshot: email,
        recipientMasked: email ? maskEmail(email) : null,
        contentHash: payslip.contentHash,
      });
    }

    // Create the dispatch and delivery records in a transaction
    const dispatch = await this.prisma.$transaction(async (tx) => {
      const createdDispatch = await tx.payslipEmailDispatch.create({
        data: {
          payslipBatchId: batchId,
          mode,
          includeCarriedForward,
          createdById: actor.id,
          status: PayslipEmailDispatchStatus.PENDING_APPROVAL,
          recipientCount,
          skippedCount,
        },
      });

      await tx.payslipDelivery.createMany({
        data: deliveryInputs.map((d) => ({
          ...d,
          dispatchId: createdDispatch.id,
        })),
      });

      return createdDispatch;
    });

    await this.auditService.log({
      actorType: 'HR_OFFICER',
      actorHrOfficerId: actor.id,
      action: 'PAYSLIP_EMAIL_DISPATCH_CREATED',
      entityType: 'PAYSLIP_EMAIL_DISPATCH',
      entityId: dispatch.id,
      metadata: {
        batchId,
        mode,
        recipientCount,
        skippedCount,
      },
    });

    return dispatch;
  }

  /**
   * POST /payslip/batches/:batchId/email-dispatch/:dispatchId/approve
   * Only ADMIN role can approve dispatches for live delivery.
   */
  @Post(':batchId/email-dispatch/:dispatchId/approve')
  @HttpCode(HttpStatus.OK)
  async approveDispatch(
    @Param('batchId') batchId: string,
    @Param('dispatchId') dispatchId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.authService.assertBatch(batchId, actor);

    if (actor.role !== HrOfficerRole.ADMIN) {
      throw payslipError(HttpStatus.FORBIDDEN, 'ADMIN_REQUIRED', 'Only administrators can approve an email dispatch.');
    }

    const dispatch = await this.prisma.payslipEmailDispatch.findUnique({
      where: { id: dispatchId },
    });

    if (!dispatch || dispatch.payslipBatchId !== batchId) {
      throw new NotFoundException('Dispatch not found.');
    }

    if (dispatch.status !== PayslipEmailDispatchStatus.PENDING_APPROVAL) {
      throw payslipError(
        HttpStatus.BAD_REQUEST,
        'DISPATCH_NOT_APPROVABLE',
        `Dispatch cannot be approved from status ${dispatch.status}.`,
      );
    }

    const updated = await this.prisma.payslipEmailDispatch.update({
      where: { id: dispatchId },
      data: {
        status: PayslipEmailDispatchStatus.APPROVED,
        approvedById: actor.id,
        approvedAt: new Date(),
      },
    });

    await this.auditService.log({
      actorType: 'HR_OFFICER',
      actorHrOfficerId: actor.id,
      action: 'PAYSLIP_EMAIL_DISPATCH_APPROVED',
      entityType: 'PAYSLIP_EMAIL_DISPATCH',
      entityId: dispatchId,
      metadata: { batchId },
    });

    // Trigger delivery worker immediately in background
    void this.worker.processNextDeliveries();

    return updated;
  }

  /**
   * POST /payslip/batches/:batchId/email-dispatch/:dispatchId/pause
   */
  @Post(':batchId/email-dispatch/:dispatchId/pause')
  @HttpCode(HttpStatus.OK)
  async pauseDispatch(
    @Param('batchId') batchId: string,
    @Param('dispatchId') dispatchId: string,
    @Body() dto: PauseDispatchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.authService.assertBatch(batchId, actor);

    const dispatch = await this.prisma.payslipEmailDispatch.findUnique({
      where: { id: dispatchId },
    });

    if (!dispatch || dispatch.payslipBatchId !== batchId) {
      throw new NotFoundException('Dispatch not found.');
    }

    if (dispatch.status !== PayslipEmailDispatchStatus.SENDING && dispatch.status !== PayslipEmailDispatchStatus.APPROVED) {
      throw new BadRequestException(`Cannot pause a dispatch with status ${dispatch.status}.`);
    }

    const updated = await this.prisma.payslipEmailDispatch.update({
      where: { id: dispatchId },
      data: {
        status: PayslipEmailDispatchStatus.PAUSED,
        pauseReason: dto.reason || 'Paused by user',
      },
    });

    await this.auditService.log({
      actorType: 'HR_OFFICER',
      actorHrOfficerId: actor.id,
      action: 'PAYSLIP_EMAIL_DISPATCH_PAUSED',
      entityType: 'PAYSLIP_EMAIL_DISPATCH',
      entityId: dispatchId,
      metadata: { reason: dto.reason },
    });

    return updated;
  }

  /**
   * POST /payslip/batches/:batchId/email-dispatch/:dispatchId/resume
   */
  @Post(':batchId/email-dispatch/:dispatchId/resume')
  @HttpCode(HttpStatus.OK)
  async resumeDispatch(
    @Param('batchId') batchId: string,
    @Param('dispatchId') dispatchId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.authService.assertBatch(batchId, actor);

    const dispatch = await this.prisma.payslipEmailDispatch.findUnique({
      where: { id: dispatchId },
    });

    if (!dispatch || dispatch.payslipBatchId !== batchId) {
      throw new NotFoundException('Dispatch not found.');
    }

    if (dispatch.status !== PayslipEmailDispatchStatus.PAUSED) {
      throw new BadRequestException(`Cannot resume a dispatch that is not PAUSED (current status: ${dispatch.status}).`);
    }

    const updated = await this.prisma.payslipEmailDispatch.update({
      where: { id: dispatchId },
      data: {
        status: PayslipEmailDispatchStatus.SENDING,
        pauseReason: null,
      },
    });

    await this.auditService.log({
      actorType: 'HR_OFFICER',
      actorHrOfficerId: actor.id,
      action: 'PAYSLIP_EMAIL_DISPATCH_RESUMED',
      entityType: 'PAYSLIP_EMAIL_DISPATCH',
      entityId: dispatchId,
    });

    void this.worker.processNextDeliveries();

    return updated;
  }

  /**
   * POST /payslip/batches/:batchId/email-dispatch/:dispatchId/cancel
   */
  @Post(':batchId/email-dispatch/:dispatchId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelDispatch(
    @Param('batchId') batchId: string,
    @Param('dispatchId') dispatchId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.authService.assertBatch(batchId, actor);

    const dispatch = await this.prisma.payslipEmailDispatch.findUnique({
      where: { id: dispatchId },
    });

    if (!dispatch || dispatch.payslipBatchId !== batchId) {
      throw new NotFoundException('Dispatch not found.');
    }

    if (
      dispatch.status === PayslipEmailDispatchStatus.COMPLETED ||
      dispatch.status === PayslipEmailDispatchStatus.COMPLETED_WITH_FAILURES ||
      dispatch.status === PayslipEmailDispatchStatus.CANCELLED
    ) {
      throw new BadRequestException(`Cannot cancel an already finished dispatch.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await tx.payslipEmailDispatch.update({
        where: { id: dispatchId },
        data: {
          status: PayslipEmailDispatchStatus.CANCELLED,
        },
      });

      // Mark all pending or scheduled deliveries as CANCELLED
      await tx.payslipDelivery.updateMany({
        where: {
          dispatchId,
          status: { in: [PayslipDeliveryStatus.PENDING, PayslipDeliveryStatus.RETRY_SCHEDULED] },
        },
        data: {
          status: PayslipDeliveryStatus.CANCELLED,
        },
      });

      return d;
    });

    await this.auditService.log({
      actorType: 'HR_OFFICER',
      actorHrOfficerId: actor.id,
      action: 'PAYSLIP_EMAIL_DISPATCH_CANCELLED',
      entityType: 'PAYSLIP_EMAIL_DISPATCH',
      entityId: dispatchId,
    });

    return updated;
  }

  /**
   * GET /payslip/batches/:batchId/email-dispatch/:dispatchId
   * Detail view with delivery breakdown stats.
   */
  @Get(':batchId/email-dispatch/:dispatchId')
  async getDispatch(
    @Param('batchId') batchId: string,
    @Param('dispatchId') dispatchId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.authService.assertBatch(batchId, actor);

    const dispatch = await this.prisma.payslipEmailDispatch.findUnique({
      where: { id: dispatchId },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!dispatch || dispatch.payslipBatchId !== batchId) {
      throw new NotFoundException('Dispatch not found.');
    }

    const deliveryCounts = await this.prisma.payslipDelivery.groupBy({
      by: ['status'],
      where: { dispatchId },
      _count: { id: true },
    });

    const statusMap = deliveryCounts.reduce((acc, curr) => {
      acc[curr.status] = curr._count.id;
      return acc;
    }, {} as Record<string, number>);

    return {
      dispatch,
      breakdown: statusMap,
    };
  }

  /**
   * POST /payslip/batches/:batchId/email-dispatch/:dispatchId/retry-failed
   * Resets FAILED deliveries back to PENDING.
   */
  @Post(':batchId/email-dispatch/:dispatchId/retry-failed')
  @HttpCode(HttpStatus.OK)
  async retryFailedDeliveries(
    @Param('batchId') batchId: string,
    @Param('dispatchId') dispatchId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.authService.assertBatch(batchId, actor);

    const dispatch = await this.prisma.payslipEmailDispatch.findUnique({
      where: { id: dispatchId },
    });

    if (!dispatch || dispatch.payslipBatchId !== batchId) {
      throw new NotFoundException('Dispatch not found.');
    }

    const updated = await this.prisma.payslipDelivery.updateMany({
      where: {
        dispatchId,
        status: PayslipDeliveryStatus.FAILED,
      },
      data: {
        status: PayslipDeliveryStatus.PENDING,
        autoRetryCount: 0,
        nextAttemptAt: null,
      },
    });

    if (updated.count > 0 && [PayslipEmailDispatchStatus.COMPLETED, PayslipEmailDispatchStatus.COMPLETED_WITH_FAILURES].includes(dispatch.status)) {
      await this.prisma.payslipEmailDispatch.update({
        where: { id: dispatchId },
        data: {
          status: PayslipEmailDispatchStatus.SENDING,
        },
      });
    }

    void this.worker.processNextDeliveries();

    return {
      retriedCount: updated.count,
    };
  }

  /**
   * GET /payslip/batches/:batchId/distribution
   * Per-payslip delivery status summary for the entire batch.
   */
  @Get(':batchId/distribution')
  async getBatchDistribution(
    @Param('batchId') batchId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.authService.assertBatch(batchId, actor);

    const deliveries = await this.prisma.payslipDelivery.findMany({
      where: { payslipBatchId: batchId },
      select: {
        id: true,
        payslipId: true,
        status: true,
        recipientMasked: true,
        submittedAt: true,
        deliveredAt: true,
        lastErrorCode: true,
        lastErrorMessage: true,
        attemptCount: true,
        isTest: true,
      },
    });

    return {
      total: deliveries.length,
      deliveries,
    };
  }
}
