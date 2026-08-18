import { Injectable } from '@nestjs/common';
import type {
  ConversationReply,
  InboundConversationMessage,
} from '../chat/conversation.contracts';

export type WhatsappInboundMessage =
  | {
      from: string;
      type: 'text';
      text: { body: string };
      id?: string;
      timestamp?: Date;
    }
  | {
      from: string;
      type: 'button';
      button: { payload: string };
      id?: string;
      timestamp?: Date;
    }
  | {
      from: string;
      type: 'list';
      list: { id: string };
      id?: string;
      timestamp?: Date;
    };

export type WhatsappOutboundMessage =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'menu';
      menuId: string;
      title: string;
      prompt: string;
      options: readonly { id: string; label: string }[];
    };

/**
 * Translates the local WhatsApp value model to and from conversation contracts.
 * It deliberately contains no Meta SDK, Graph API, credential, or webhook code.
 */
@Injectable()
export class WhatsappMessageMapper {
  toInbound(message: WhatsappInboundMessage): InboundConversationMessage {
    const base = {
      senderPhoneNumber: message.from,
      externalMessageId: message.id,
      receivedAt: message.timestamp,
    };

    if (message.type === 'text') {
      return {
        ...base,
        input: { kind: 'text', value: message.text.body },
      };
    }

    return {
      ...base,
      input: {
        kind: 'selection',
        value: message.type === 'button' ? message.button.payload : message.list.id,
      },
    };
  }

  toOutbound(reply: ConversationReply): WhatsappOutboundMessage {
    if (reply.type === 'text') {
      return { type: 'text', text: reply.text };
    }

    return {
      type: 'menu',
      menuId: reply.menuId,
      title: reply.title,
      prompt: reply.prompt,
      options: reply.options,
    };
  }
}
