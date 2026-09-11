import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { ConversationModule } from '../chat/chat.module';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappGraphClient } from './whatsapp-graph-client.service';
import { WhatsappMessageMapper } from './whatsapp-message.mapper';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [ConversationModule, HttpModule],
  providers: [WhatsappService, WhatsappMessageMapper, WhatsappGraphClient],
  controllers: [WhatsappController],
  exports: [WhatsappGraphClient],
})
export class WhatsappModule {}
