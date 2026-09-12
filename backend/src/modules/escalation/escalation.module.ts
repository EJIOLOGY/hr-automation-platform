import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { PrismaModule } from '../../core/prisma/prisma.module';
import { EscalationService } from './escalation.service';
import { HrQueueEngagementService } from './hr-queue-engagement.service';

@Module({
  imports: [PrismaModule, HttpModule],
  providers: [EscalationService, HrQueueEngagementService],
  exports: [EscalationService, HrQueueEngagementService],
})
export class EscalationModule {}
