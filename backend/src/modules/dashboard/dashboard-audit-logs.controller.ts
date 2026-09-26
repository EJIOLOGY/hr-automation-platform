import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { HrOfficerRole } from '../../generated/prisma/enums';
import { AuditService } from '../audit/audit.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { AuditLogListQueryDto } from './dashboard-audit-logs.dto';

@Controller('dashboard/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(HrOfficerRole.ADMIN)
export class DashboardAuditLogsController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query() query: AuditLogListQueryDto) {
    return this.auditService.list(query);
  }
}
