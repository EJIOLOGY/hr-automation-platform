export type ConversationInput =
  | {
      kind: 'text';
      value: string;
    }
  | {
      kind: 'selection';
      value: string;
    };

/** A normalized, transport-neutral inbound message. */
export interface InboundConversationMessage {
  senderPhoneNumber: string;
  input: ConversationInput;
  externalMessageId?: string;
  receivedAt?: Date;
}

export interface TextConversationReply {
  type: 'text';
  text: string;
}

export interface MenuConversationReply {
  type: 'menu';
  menuId: string;
  title: string;
  prompt: string;
  options: readonly {
    id: string;
    label: string;
  }[];
}

export type ConversationReply = TextConversationReply | MenuConversationReply;

/** Transport-neutral result returned by the conversation application service. */
export interface ConversationResponse {
  success: boolean;
  replies: readonly ConversationReply[];
  message?: string;
  menu?: MenuConversationReply;
  sessionId?: string;
  state?: string;
  action?: string;
  escalationAvailable?: boolean;
  escalated?: boolean;
  escalationId?: string;
  previousState?: string;
  status?: 'OPEN' | 'IN_PROGRESS';
  queuePosition?: number;
  hrBusy?: boolean;
}

export interface ConversationPort {
  handleMessage(
    message: InboundConversationMessage,
  ): Promise<ConversationResponse>;
}

export const CONVERSATION_PORT = Symbol('CONVERSATION_PORT');
