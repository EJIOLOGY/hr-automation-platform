import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/prisma/prisma.module';
import { WhatsappGraphClientModule } from '../whatsapp/whatsapp-graph-client.module';

import { EscalationService } from './escalation.service';
import { HrQueueEngagementService } from './hr-queue-engagement.service';

@Module({
  imports: [PrismaModule, WhatsappGraphClientModule],
  providers: [EscalationService, HrQueueEngagementService],
  exports: [EscalationService, HrQueueEngagementService],
})
export class EscalationModule {}
