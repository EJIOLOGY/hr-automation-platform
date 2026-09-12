import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { EscalationModule } from '../escalation/escalation.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { HrDocumentRequestService } from '../verification/hr-document-request.service';

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
  imports: [
    PrismaModule,
    AuthModule,
    AuditModule,
    EscalationModule,
    WhatsappModule,
    RealtimeModule,
  ],
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
    HrDocumentRequestService,
  ],
  exports: [
    DashboardService,
    DashboardConversationsService,
    DashboardEscalationsService,
    DashboardHrRequestsService,
  ],
})
export class DashboardModule {}
