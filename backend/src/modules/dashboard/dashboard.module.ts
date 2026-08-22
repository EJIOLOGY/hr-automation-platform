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

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, EscalationModule],

  controllers: [
    DashboardController,
    DashboardConversationsController,
    DashboardEscalationsController,
  ],

  providers: [
    DashboardService,
    DashboardConversationsService,
    DashboardEscalationsService,
  ],

  exports: [
    DashboardService,
    DashboardConversationsService,
    DashboardEscalationsService,
  ],
})
export class DashboardModule {}
