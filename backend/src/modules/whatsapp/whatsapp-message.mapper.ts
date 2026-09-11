import { Injectable } from '@nestjs/common';
import type {
  ConversationReply,
  InboundConversationMessage,
} from '../chat/conversation.contracts';
import { PhoneNumberNormalizer } from '../../shared/utils/phone-number-normalizer';

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
      type: 'interactive';
      interactive: {
        type: 'list_reply';
        list_reply: {
          id: string;
        };
      };
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
      presentation: 'list' | 'text';
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
      senderPhoneNumber: PhoneNumberNormalizer.normalize(message.from),
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
        value:
          message.type === 'button'
            ? message.button.payload
            : message.interactive.list_reply.id,
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
      presentation: reply.presentation,
      options: reply.options,
    };
  }
}
