import { Module } from '@nestjs/common';
import { ConversationService } from './chat.service';
import { ConversationController } from './chat.controller';
import { EmployeeModule } from '../employee/employee.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ChatSessionModule } from './chat-session.module';

@Module({
  imports: [EmployeeModule, PrismaModule, ChatSessionModule],
  providers: [ConversationService],
  controllers: [ConversationController],
})
export class ConversationModule {}
