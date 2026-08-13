import { Module } from '@nestjs/common';
import { ConversationService } from './chat.service';
import { ConversationController } from './chat.controller';

@Module({
  providers: [ConversationService],
  controllers: [ConversationController],
})
export class ConversationModule {}
