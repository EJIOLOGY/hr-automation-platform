import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/prisma/prisma.module';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

import { DashboardConversationsController } from './dashboard-conversations.controller';
import { DashboardConversationsService } from './dashboard-conversations.service';

@Module({
  imports: [PrismaModule],

  controllers: [DashboardController, DashboardConversationsController],

  providers: [DashboardService, DashboardConversationsService],

  exports: [DashboardService, DashboardConversationsService],
})
export class DashboardModule {}
