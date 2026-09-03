import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { EscalationModule } from '../escalation/escalation.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardConversationsController } from './dashboard-conversations.controller';
import { DashboardConversationsService } from './dashboard-conversations.service';
import { DashboardEscalationsController } from './dashboard-escalations.controller';
import { DashboardEscalationsService } from './dashboard-escalations.service';
import { DashboardHrRequestsController } from './dashboard-hr-requests.controller';
import { DashboardHrRequestsService } from './dashboard-hr-requests.service';
import { DashboardAuditLogsController } from './dashboard-audit-logs.controller';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, EscalationModule],
  controllers: [
    DashboardController,
    DashboardConversationsController,
    DashboardEscalationsController,
    DashboardHrRequestsController,
    DashboardAuditLogsController,
  ],
  providers: [
    DashboardService,
    DashboardConversationsService,
    DashboardEscalationsService,
    DashboardHrRequestsService,
  ],
  exports: [
    DashboardService,
    DashboardConversationsService,
    DashboardEscalationsService,
    DashboardHrRequestsService,
  ],
})
export class DashboardModule {}
