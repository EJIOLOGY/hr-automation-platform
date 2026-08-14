import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ChatSessionService } from './chat-session.service';

@Module({
  imports: [PrismaModule],
  providers: [ChatSessionService],
  exports: [ChatSessionService],
})
export class ChatSessionModule {}
