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
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipAuthorizationService } from '../payslip-authorization.service';
import { PayslipEmailSenderService } from './payslip-email-sender.service';
import { PayslipDeliveryWorkerService } from './payslip-delivery-worker.service';
import { PayslipPdfRetentionPin } from '../pdf/payslip-pdf-reader.interface';
import { payslipError } from '../shared/payslip-error-codes';
import {
  EmailSuppressionStatus,
  Prisma,
  HrOfficerRole,
  PayslipDeliveryStatus,
  PayslipEmailDispatchMode,
  PayslipEmailDispatchStatus,
  PayslipStatus,
  PayslipPdfStatus,
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
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayslipEmailDispatchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly authService: PayslipAuthorizationService,
    private readonly sender: PayslipEmailSenderService,
    private readonly worker: PayslipDeliveryWorkerService,
    private readonly pdfRetentionPin: PayslipPdfRetentionPin,
  ) {}

  /**
   * Helper to check PDF-Ready Gate (A2.1).
   * Verifies that every payslip has a PayslipPdf in status READY (and not expired).
   */
  private async checkPdfReadyGate(
    batchId: string,
    payslipIds: string[],
  ): Promise<void> {
    const counts = await this.prisma.payslipPdf.groupBy({
      by: ['status'],
      where: {
        payslipId: { in: payslipIds },
      },
      _count: { id: true },
    });

    let readyCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let otherCount = 0;

    for (const c of counts) {
      if (c.status === PayslipPdfStatus.READY) readyCount += c._count.id;
      else if (c.status === PayslipPdfStatus.PENDING || c.status === PayslipPdfStatus.GENERATING)
        pendingCount += c._count.id;
      else if (c.status === PayslipPdfStatus.FAILED) failedCount += c._count.id;
      else otherCount += c._count.id;
    }

    const total = payslipIds.length;
    const existingPdfs = readyCount + pendingCount + failedCount + otherCount;
    const missingCount = Math.max(0, total - existingPdfs);

    if (readyCount < total) {
      // Fetch up to 100 staffIds for non-ready payslips
      const nonReadyPayslips = await this.prisma.payslip.findMany({
        where: {
          id: { in: payslipIds },
          OR: [
            { pdf: null },
            { pdf: { status: { not: PayslipPdfStatus.READY } } },
          ],
        },
        select: { staffId: true },
        take: 100,
      });

      const staffIds = nonReadyPayslips.map((p) => p.staffId);

      throw payslipError(
        HttpStatus.CONFLICT,
        'PDF_NOT_READY',
        'All payslip PDFs must be ready before email delivery can start.',
        {
          counts: {
            total,
            ready: readyCount,
            pending: pendingCount,
            failed: failedCount,
            missing: missingCount,
          },
          staffIds,
        },
      );
    }
  }

  /**
   * POST /payslip/batches/:batchId/email-dispatch
   * Creates a new dispatch draft in PENDING_APPROVAL status.
   */
  @Post(':batchId/email-dispatch')
  @Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
  @HttpCode(HttpStatus.CREATED)
  async createDispatch(
    @Param('batchId') batchId: string,
    @Body() dto: CreateDispatchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.authService.assertBatch(batchId, actor);

    const batchRecord = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
      include: { payrollPeriod: true },
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
      include: { employee: true },
    });

    if (payslips.length === 0) {
      throw payslipError(
        HttpStatus.BAD_REQUEST,
        'NOTHING_TO_APPROVE',
        'No approved payslips found for this batch.',
      );
    }

    // A2.1: Enforce PDF-Ready Gate at creation
    const allPayslipIds = payslips.map((p) => p.id);
    await this.checkPdfReadyGate(batchId, allPayslipIds);

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
    const suppressedSet = new Set(
      activeSuppressions.map((s) => s.emailNormalized),
    );

    let recipientCount = 0;
    let skippedCount = 0;

    const deliveryInputs: Omit<
      Prisma.PayslipDeliveryCreateManyInput,
      'dispatchId'
    >[] = [];

    for (const payslip of payslips) {
      const email = payslip.employee?.email
        ? normalizeEmail(payslip.employee.email)
        : null;
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
        status: isSkipped
          ? PayslipDeliveryStatus.SKIPPED
          : PayslipDeliveryStatus.PENDING,
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
   * POST /payslip/batches/:batchId/email-dispatch/:dispatchId/release
   * (also aliases /approve for compatibility)
   * Only ADMIN role can release an email dispatch.
   */
  @Post([':batchId/email-dispatch/:dispatchId/release', ':batchId/email-dispatch/:dispatchId/approve'])
  @Roles(HrOfficerRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async releaseDispatch(
    @Param('batchId') batchId: string,
    @Param('dispatchId') dispatchId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.authService.assertBatch(batchId, actor);

    const dispatch = await this.prisma.payslipEmailDispatch.findUnique({
      where: { id: dispatchId },
      include: {
        deliveries: {
          select: { payslipId: true, recipientEmailSnapshot: true, status: true },
        },
      },
    });

    if (!dispatch || dispatch.payslipBatchId !== batchId) {
      throw new NotFoundException('Dispatch not found.');
    }

    if (dispatch.status !== PayslipEmailDispatchStatus.PENDING_APPROVAL) {
      throw payslipError(
        HttpStatus.BAD_REQUEST,
        'DISPATCH_NOT_APPROVABLE',
        `Dispatch cannot be released from status ${dispatch.status}.`,
      );
    }

    const pendingDeliveries = dispatch.deliveries.filter(
      (d) => d.status === PayslipDeliveryStatus.PENDING,
    );
    const payslipIds = pendingDeliveries.map((d) => d.payslipId);

    // A2.1: Enforce PDF-Ready Gate at release
    await this.checkPdfReadyGate(batchId, payslipIds);

    // A1.5: Sandbox gate check
    const isProd = await this.sender.isProductionAccessEnabled();
    if (!isProd && this.sender.getIsConfigured()) {
      let verifiedCount = 0;
      let unverifiedCount = 0;

      for (const d of pendingDeliveries) {
        if (!d.recipientEmailSnapshot) {
          unverifiedCount++;
          continue;
        }
        const isVerified = await this.sender.isRecipientVerifiedInSandbox(d.recipientEmailSnapshot);
        if (isVerified) {
          verifiedCount++;
        } else {
          unverifiedCount++;
        }
      }

      if (unverifiedCount > 0) {
        throw payslipError(
          HttpStatus.CONFLICT,
          'SES_SANDBOX_RESTRICTED',
          'SES is in sandbox mode. All recipients must be verified identities before release.',
          {
            eligibleCount: verifiedCount,
            ineligibleCount: unverifiedCount,
          },
        );
      }
    }

    // A2.2: Pin on release (batched chunked by 500)
    const pinDays = Number(process.env.PAYSLIP_PDF_PIN_DAYS) || 3;
    for (let i = 0; i < payslipIds.length; i += 500) {
      const chunk = payslipIds.slice(i, i + 500);
      await this.pdfRetentionPin.pin(chunk, pinDays);
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

    return updated;
  }

  /**
   * POST /payslip/batches/:batchId/email-dispatch/:dispatchId/pause
   */
  @Post(':batchId/email-dispatch/:dispatchId/pause')
  @Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
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

    if (
      dispatch.status !== PayslipEmailDispatchStatus.SENDING &&
      dispatch.status !== PayslipEmailDispatchStatus.APPROVED
    ) {
      throw new BadRequestException(
        `Cannot pause a dispatch with status ${dispatch.status}.`,
      );
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
  @Roles(HrOfficerRole.ADMIN)
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
      throw new BadRequestException(
        `Cannot resume a dispatch that is not PAUSED (current status: ${dispatch.status}).`,
      );
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

    return updated;
  }

  /**
   * POST /payslip/batches/:batchId/email-dispatch/:dispatchId/cancel
   */
  @Post(':batchId/email-dispatch/:dispatchId/cancel')
  @Roles(HrOfficerRole.ADMIN)
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

      // Mark all pending or scheduled deliveries as CANCELLED (never touch SUBMITTED or SUBMISSION_UNKNOWN)
      await tx.payslipDelivery.updateMany({
        where: {
          dispatchId,
          status: {
            in: [
              PayslipDeliveryStatus.PENDING,
              PayslipDeliveryStatus.RETRY_SCHEDULED,
            ],
          },
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
   */
  @Get(':batchId/email-dispatch/:dispatchId')
  @Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
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

    const statusMap = deliveryCounts.reduce(
      (acc, curr) => {
        acc[curr.status] = curr._count.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      dispatch,
      breakdown: statusMap,
    };
  }

  /**
   * POST /payslip/batches/:batchId/email-dispatch/:dispatchId/retry-failed
   */
  @Post(':batchId/email-dispatch/:dispatchId/retry-failed')
  @Roles(HrOfficerRole.ADMIN)
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

    if (
      updated.count > 0 &&
      ([
        PayslipEmailDispatchStatus.COMPLETED,
        PayslipEmailDispatchStatus.COMPLETED_WITH_FAILURES,
      ] as readonly PayslipEmailDispatchStatus[]).includes(dispatch.status)
    ) {
      await this.prisma.payslipEmailDispatch.update({
        where: { id: dispatchId },
        data: {
          status: PayslipEmailDispatchStatus.SENDING,
        },
      });
    }

    return {
      retriedCount: updated.count,
    };
  }

  /**
   * GET /payslip/batches/:batchId/distribution
   */
  @Get(':batchId/distribution')
  @Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
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
