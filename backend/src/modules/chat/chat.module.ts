import { Module } from '@nestjs/common';
import { ConversationService } from './chat.service';
import { ConversationController } from './chat.controller';
import { EmployeeModule } from '../employee/employee.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ChatSessionModule } from './chat-session.module';
import { MenuReplyBuilderService } from './menu-reply-builder.service';
import { EscalationModule } from '../escalation/escalation.module';

@Module({
  imports: [EmployeeModule, PrismaModule, ChatSessionModule, EscalationModule],
  providers: [ConversationService, MenuReplyBuilderService],
  controllers: [ConversationController],
  exports: [MenuReplyBuilderService],
})
export class ConversationModule {}
