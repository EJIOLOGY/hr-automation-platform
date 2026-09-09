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

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
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
    // Meta can send non-message events such as delivery/read/status updates.
    // Ignore unsupported events safely until they are needed.
    if (!isWhatsappWebhookPayload(payload)) {
      return { received: true };
    }

    for (const message of payload.messages) {
      await this.whatsappService.handleInbound(message);
    }

    return { received: true };
  }
}

function isWhatsappWebhookPayload(payload: unknown): payload is {
  messages: Parameters<WhatsappService['handleInbound']>[0][];
} {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as { messages?: unknown };

  return Array.isArray(candidate.messages);
}
