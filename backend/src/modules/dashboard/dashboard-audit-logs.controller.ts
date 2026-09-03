import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { AuditLogListQueryDto } from './dashboard-audit-logs.dto';

@Controller('dashboard/audit-logs')
@UseGuards(JwtAuthGuard)
export class DashboardAuditLogsController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query() query: AuditLogListQueryDto) {
    return this.auditService.list(query);
  }
}
