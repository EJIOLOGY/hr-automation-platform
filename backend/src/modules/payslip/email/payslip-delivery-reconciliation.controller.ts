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
import {
  HrOfficerRole,
  PayslipDeliveryStatus,
} from '../../../generated/prisma/client';
import { SesEventMapperService } from './ses-event-mapper.service';

export class ResolveUnknownDto {
  resolution!: 'RESEND' | 'MARK_DELIVERED_MANUALLY' | 'MARK_FAILED';
  note!: string;
}

@Controller('payslip')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayslipDeliveryReconciliationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly mapper: SesEventMapperService,
  ) {}

  /**
   * POST /payslip/admin/reconcile
   * Admin-only: processes pending SES notification events and reports stale SUBMISSION_UNKNOWN deliveries.
   */
  @Post('admin/reconcile')
  @Roles(HrOfficerRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async triggerReconciliation(): Promise<{ reconciledCount: number; processedEvents: number }> {
    // 1. Process any SesNotificationEvent with processedAt IS NULL
    const pendingEvents = await this.prisma.sesNotificationEvent.findMany({
      where: { processedAt: null },
      take: 50,
    });
    for (const evt of pendingEvents) {
      await this.mapper.processEvent(evt.id);
    }

    // 2. Count unresolved SUBMISSION_UNKNOWN older than 15 mins
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const unknownDeliveries = await this.prisma.payslipDelivery.findMany({
      where: {
        status: PayslipDeliveryStatus.SUBMISSION_UNKNOWN,
        updatedAt: { lt: fifteenMinsAgo },
      },
      take: 50,
      select: { id: true, employeeId: true, updatedAt: true, dispatchId: true },
    });

    return {
      reconciledCount: unknownDeliveries.length,
      processedEvents: pendingEvents.length,
    };
  }

  /**
   * POST /payslip/deliveries/:id/resolve-unknown
   * Admin-only resolution of SUBMISSION_UNKNOWN delivery.
   */
  @Post('deliveries/:id/resolve-unknown')
  @Roles(HrOfficerRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async resolveUnknown(
    @Param('id') id: string,
    @Body() dto: ResolveUnknownDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!dto.note || dto.note.trim().length === 0) {
      throw new BadRequestException('A resolution note is required.');
    }

    const delivery = await this.prisma.payslipDelivery.findUnique({
      where: { id },
    });
    if (!delivery) {
      throw new NotFoundException('Delivery record not found.');
    }

    if (delivery.status !== PayslipDeliveryStatus.SUBMISSION_UNKNOWN) {
      throw new BadRequestException(
        `Delivery is not in SUBMISSION_UNKNOWN status (current status: ${delivery.status}).`,
      );
    }

    const note = dto.note.trim();

    if (dto.resolution === 'MARK_DELIVERED_MANUALLY') {
      const updated = await this.prisma.payslipDelivery.update({
        where: { id },
        data: {
          status: PayslipDeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
          lastErrorMessage: `Manually marked delivered by ${actor.fullName}: ${note}`,
        },
      });

      await this.auditService.log({
        actorType: 'HR_OFFICER',
        actorHrOfficerId: actor.id,
        action: 'PAYSLIP_DELIVERY_MANUALLY_RESOLVED',
        entityType: 'PAYSLIP_DELIVERY',
        entityId: id,
        metadata: { resolution: dto.resolution, note },
      });

      return updated;
    }

    if (dto.resolution === 'MARK_FAILED') {
      const updated = await this.prisma.payslipDelivery.update({
        where: { id },
        data: {
          status: PayslipDeliveryStatus.FAILED,
          lastErrorMessage: `Marked failed by ${actor.fullName}: ${note}`,
        },
      });

      await this.auditService.log({
        actorType: 'HR_OFFICER',
        actorHrOfficerId: actor.id,
        action: 'PAYSLIP_DELIVERY_MANUALLY_RESOLVED',
        entityType: 'PAYSLIP_DELIVERY',
        entityId: id,
        metadata: { resolution: dto.resolution, note },
      });

      return updated;
    }

    if (dto.resolution === 'RESEND') {
      // Create new delivery, mark old one as FAILED / superseded
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.payslipDelivery.update({
          where: { id },
          data: {
            status: PayslipDeliveryStatus.FAILED,
            lastErrorMessage: `Superseded by re-send requested by ${actor.fullName}: ${note}`,
          },
        });

        const newDelivery = await tx.payslipDelivery.create({
          data: {
            payslipId: delivery.payslipId,
            payslipBatchId: delivery.payslipBatchId,
            accountingCompanyId: delivery.accountingCompanyId,
            payrollPeriodId: delivery.payrollPeriodId,
            employeeId: delivery.employeeId,
            dispatchId: delivery.dispatchId,
            status: PayslipDeliveryStatus.PENDING,
            isTest: delivery.isTest,
            isCorrection: true,
            correctsDeliveryId: delivery.id,
            recipientEmailSnapshot: delivery.recipientEmailSnapshot,
            recipientMasked: delivery.recipientMasked,
            contentHash: delivery.contentHash,
          },
        });

        return newDelivery;
      });

      await this.auditService.log({
        actorType: 'HR_OFFICER',
        actorHrOfficerId: actor.id,
        action: 'PAYSLIP_DELIVERY_MANUALLY_RESOLVED',
        entityType: 'PAYSLIP_DELIVERY',
        entityId: id,
        metadata: { resolution: dto.resolution, note, newDeliveryId: result.id },
      });

      return result;
    }

    throw new BadRequestException('Invalid resolution option.');
  }
}
