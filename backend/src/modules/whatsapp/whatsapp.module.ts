import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappGraphClient } from './whatsapp-graph-client.service';
import { ConversationModule } from '../chat/chat.module';
import { WhatsappMessageMapper } from './whatsapp-message.mapper';

@Module({
  imports: [ConversationModule, HttpModule],
  providers: [WhatsappService, WhatsappMessageMapper, WhatsappGraphClient],
  controllers: [WhatsappController],
})
export class WhatsappModule {}
