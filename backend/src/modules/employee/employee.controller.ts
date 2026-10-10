import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { isEmailValid, maskEmail, normalizeEmail } from './email-utils';

export class PatchEmployeeEmailDto {
  email!: string;
}


@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * PATCH /employees/:employeeId/email
   *
   * Update a single employee's email address. The new address must pass both
   * format validation (RFC 5322-ish) and MX DNS resolution. Setting email to
   * an empty string clears the field.
   */
  @Patch(':employeeId/email')
  @HttpCode(HttpStatus.OK)
  async updateEmail(
    @Param('employeeId') employeeId: string,
    @Body() body: PatchEmployeeEmailDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ employeeId: string; emailMasked: string | null }> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, email: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    // Allow clearing the email by sending an empty string
    const raw = (body.email ?? '').trim();

    if (raw === '') {
      await this.prisma.employee.update({
        where: { id: employeeId },
        data: { email: null, emailUpdatedAt: new Date() },
      });

      await this.auditService.log({
        actorType: 'HR_OFFICER',
        actorHrOfficerId: actor.id,
        action: 'EMPLOYEE_EMAIL_CLEARED',
        entityType: 'EMPLOYEE',
        entityId: employeeId,
        metadata: { previousMasked: employee.email ? maskEmail(employee.email) : null },
      });

      return { employeeId, emailMasked: null };
    }

    const normalized = normalizeEmail(raw);

    const valid = await isEmailValid(normalized);
    if (!valid) {
      throw new BadRequestException(
        `"${raw}" is not a valid email address or the domain has no MX records.`,
      );
    }

    const emailChanged = employee.email !== normalized;

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        email: normalized,
        ...(emailChanged ? { emailUpdatedAt: new Date() } : {}),
      },
    });

    if (emailChanged) {
      await this.auditService.log({
        actorType: 'HR_OFFICER',
        actorHrOfficerId: actor.id,
        action: 'EMPLOYEE_EMAIL_UPDATED',
        entityType: 'EMPLOYEE',
        entityId: employeeId,
        metadata: {
          previousMasked: employee.email ? maskEmail(employee.email) : null,
          newMasked: maskEmail(normalized),
        },
      });
    }

    return { employeeId, emailMasked: maskEmail(normalized) };
  }
}
