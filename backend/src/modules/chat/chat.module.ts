import { Module } from '@nestjs/common';
import { ConversationService } from './chat.service';
import { EmployeeModule } from '../employee/employee.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ChatSessionModule } from './chat-session.module';
import { MenuReplyBuilderService } from './menu-reply-builder.service';
import { EscalationModule } from '../escalation/escalation.module';
import { HrContentModule } from '../../content/hr-content.module';
import { LeaveModule } from '../leave/leave.module';
import { VerificationModule } from '../verification/verification.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CONVERSATION_PORT } from './conversation.contracts';

@Module({
  imports: [
    EmployeeModule,
    PrismaModule,
    ChatSessionModule,
    EscalationModule,
    HrContentModule,
    LeaveModule,
    VerificationModule,
    AnalyticsModule,
  ],
  providers: [
    ConversationService,
    MenuReplyBuilderService,
    { provide: CONVERSATION_PORT, useExisting: ConversationService },
  ],
  exports: [ConversationService, CONVERSATION_PORT, MenuReplyBuilderService],
})
export class ConversationModule {}
