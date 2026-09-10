import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from './whatsapp.service';
import { WhatsappGraphClient } from './whatsapp-graph-client.service';
import type { WhatsappInboundMessage } from './whatsapp-message.mapper';

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly whatsappGraphClient: WhatsappGraphClient,
    private readonly configService: ConfigService,
  ) {}

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const expectedToken = this.configService.get<string>(
      'WHATSAPP_VERIFY_TOKEN',
    );

    if (
      mode !== 'subscribe' ||
      !expectedToken ||
      verifyToken !== expectedToken
    ) {
      throw new ForbiddenException();
    }

    return challenge;
  }

  @Post('webhook')
  @HttpCode(200)
  async receiveWebhook(@Body() payload: unknown) {
    // Meta can send non-message events such as delivery/read/status updates,
    // and always wraps real messages under entry[].changes[].value.messages.
    // Ignore anything that doesn't contain inbound messages.
    for (const message of extractInboundMessages(payload)) {
      const replies = await this.whatsappService.handleInbound(message);

      if (replies.length > 0) {
        await this.whatsappGraphClient.sendMessages(message.from, replies);
      }
    }

    return { received: true };
  }
}

/**
 * Unwraps Meta's WhatsApp Cloud API webhook envelope
 * (`entry[].changes[].value.messages[]`) into a flat list of inbound
 * messages. Returns an empty array for any payload shape that doesn't
 * contain messages (e.g. status/delivery/read webhook events).
 */
function extractInboundMessages(payload: unknown): WhatsappInboundMessage[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) {
    return [];
  }

  const messages: WhatsappInboundMessage[] = [];

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) {
      continue;
    }

    for (const change of changes) {
      const changeMessages = (change as { value?: { messages?: unknown } })
        ?.value?.messages;

      if (Array.isArray(changeMessages)) {
        messages.push(...(changeMessages as WhatsappInboundMessage[]));
      }
    }
  }

  return messages;
}
