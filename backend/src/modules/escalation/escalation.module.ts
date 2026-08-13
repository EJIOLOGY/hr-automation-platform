import { Module } from '@nestjs/common';
import { EscalationService } from './escalation.service';
import { EscalationController } from './escalation.controller';

@Module({
  providers: [EscalationService],
  controllers: [EscalationController]
})
export class EscalationModule {}
