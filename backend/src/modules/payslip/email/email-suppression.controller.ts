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
  Query,
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
  EmailSuppressionReason,
  EmailSuppressionStatus,
  HrOfficerRole,
} from '../../../generated/prisma/client';

export class ResolveSuppressionDto {
  note!: string;
}

@Controller('payslip/email-suppressions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailSuppressionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /payslip/email-suppressions
   * List email suppressions with filters (status, reason, search prefix).
   */
  @Get()
  @Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
  async listSuppressions(
    @Query('status') status?: EmailSuppressionStatus,
    @Query('reason') reason?: EmailSuppressionReason,
    @Query('search') search?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = Math.max(1, Number(pageStr) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitStr) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (reason) where.reason = reason;
    if (search) {
      where.emailMasked = { contains: search, mode: 'insensitive' };
    }

    const [total, items] = await Promise.all([
      this.prisma.emailSuppression.count({ where }),
      this.prisma.emailSuppression.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          acknowledgedBy: { select: { id: true, fullName: true } },
          resolvedBy: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    // Responses never expose full email addresses to officers beyond masked
    const mapped = items.map((item) => ({
      id: item.id,
      emailMasked: item.emailMasked,
      reason: item.reason,
      status: item.status,
      detail: item.detail,
      createdAt: item.createdAt,
      acknowledgedAt: item.acknowledgedAt,
      acknowledgedBy: item.acknowledgedBy,
      resolvedAt: item.resolvedAt,
      resolvedBy: item.resolvedBy,
      resolutionNote: item.resolutionNote,
    }));

    return {
      data: mapped,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * POST /payslip/email-suppressions/:id/acknowledge
   * HR officer or Admin reviews suppression and marks acknowledged (keeps ACTIVE).
   */
  @Post(':id/acknowledge')
  @Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
  @HttpCode(HttpStatus.OK)
  async acknowledgeSuppression(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const suppression = await this.prisma.emailSuppression.findUnique({
      where: { id },
    });
    if (!suppression) {
      throw new NotFoundException('Suppression record not found.');
    }

    const updated = await this.prisma.emailSuppression.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedById: actor.id,
      },
    });

    await this.auditService.log({
      actorType: 'HR_OFFICER',
      actorHrOfficerId: actor.id,
      action: 'EMAIL_SUPPRESSION_ACKNOWLEDGED',
      entityType: 'EMAIL_SUPPRESSION',
      entityId: id,
      metadata: {
        emailMasked: suppression.emailMasked,
        reason: suppression.reason,
      },
    });

    return updated;
  }

  /**
   * POST /payslip/email-suppressions/:id/resolve
   * Admin sets RESOLVED after address correction. Complaint suppressions can NEVER be auto-resolved
   * and require an Admin note.
   */
  @Post(':id/resolve')
  @Roles(HrOfficerRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async resolveSuppression(
    @Param('id') id: string,
    @Body() dto: ResolveSuppressionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const suppression = await this.prisma.emailSuppression.findUnique({
      where: { id },
    });
    if (!suppression) {
      throw new NotFoundException('Suppression record not found.');
    }

    if (!dto.note || dto.note.trim().length === 0) {
      throw new BadRequestException('A resolution note is required.');
    }

    const updated = await this.prisma.emailSuppression.update({
      where: { id },
      data: {
        status: EmailSuppressionStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedById: actor.id,
        resolutionNote: dto.note.trim(),
      },
    });

    await this.auditService.log({
      actorType: 'HR_OFFICER',
      actorHrOfficerId: actor.id,
      action: 'EMAIL_SUPPRESSION_RESOLVED',
      entityType: 'EMAIL_SUPPRESSION',
      entityId: id,
      metadata: {
        emailMasked: suppression.emailMasked,
        reason: suppression.reason,
        note: dto.note.trim(),
      },
    });

    return updated;
  }
}
