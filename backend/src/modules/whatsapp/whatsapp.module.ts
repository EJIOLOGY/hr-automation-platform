import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { ConversationModule } from '../chat/chat.module';
import { WhatsappMessageMapper } from './whatsapp-message.mapper';

@Module({
  imports: [ConversationModule],
  providers: [WhatsappService, WhatsappMessageMapper],
  controllers: [WhatsappController],
})
export class WhatsappModule {}
