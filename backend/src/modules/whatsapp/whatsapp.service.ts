import { Inject, Injectable } from '@nestjs/common';
import {
  CONVERSATION_PORT,
  type ConversationPort,
} from '../chat/conversation.contracts';
import {
  WhatsappMessageMapper,
  type WhatsappInboundMessage,
  type WhatsappOutboundMessage,
} from './whatsapp-message.mapper';

@Injectable()
export class WhatsappService {
  constructor(
    @Inject(CONVERSATION_PORT)
    private readonly conversationService: ConversationPort,
    private readonly messageMapper: WhatsappMessageMapper,
  ) {}

  async handleInbound(
    message: WhatsappInboundMessage,
  ): Promise<WhatsappOutboundMessage[]> {
    const response = await this.conversationService.handleMessage(
      this.messageMapper.toInbound(message),
    );

    return response.replies.map((reply) =>
      this.messageMapper.toOutbound(reply),
    );
  }
}
