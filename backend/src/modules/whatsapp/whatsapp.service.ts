import { Inject, Injectable } from '@nestjs/common';
import {
  CONVERSATION_PORT,
  type ConversationPort,
} from '../chat/conversation.contracts';
import { RealtimeGateway } from '../realtime/realtime.gateway';
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
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async handleInbound(
    message: WhatsappInboundMessage,
  ): Promise<WhatsappOutboundMessage[]> {
    const response = await this.conversationService.handleMessage(
      this.messageMapper.toInbound(message),
    );

    // Notify any open HR dashboards that this conversation has new
    // messages (the employee's inbound text and, once persisted, any bot
    // replies). The dashboard re-fetches via the existing REST endpoints;
    // this is a signal only, not a data payload.
    if (response.sessionId) {
      this.realtimeGateway.notifyNewMessage(response.sessionId, 'INBOUND');
    }

    return response.replies.map((reply) =>
      this.messageMapper.toOutbound(reply),
    );
  }
}
