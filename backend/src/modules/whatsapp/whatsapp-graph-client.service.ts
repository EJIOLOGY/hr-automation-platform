import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import type { WhatsappOutboundMessage } from './whatsapp-message.mapper';

@Injectable()
export class WhatsappGraphClient {
  private readonly logger = new Logger(WhatsappGraphClient.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async sendMessage(
    to: string,
    message: WhatsappOutboundMessage,
  ): Promise<void> {
    const accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.configService.get<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    const apiVersion =
      this.configService.get<string>('WHATSAPP_GRAPH_API_VERSION') ?? 'v21.0';

    if (!accessToken || !phoneNumberId) {
      this.logger.error(
        'Cannot send WhatsApp message: WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured.',
      );
      return;
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const body = this.toGraphPayload(to, message);

    try {
      await firstValueFrom(
        this.httpService.post(url, body, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );
    } catch (error) {
      const details =
        error instanceof AxiosError
          ? JSON.stringify(error.response?.data ?? error.message)
          : String(error);

      this.logger.error(`Failed to send WhatsApp message to ${to}: ${details}`);
    }
  }

  async sendMessages(
    to: string,
    messages: readonly WhatsappOutboundMessage[],
  ): Promise<void> {
    // WhatsApp requires messages to a single recipient to be sent
    // sequentially, not concurrently, to preserve ordering.
    for (const message of messages) {
      await this.sendMessage(to, message);
    }
  }

  private toGraphPayload(to: string, message: WhatsappOutboundMessage) {
    if (message.type === 'text') {
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message.text },
      };
    }

    if (message.presentation === 'text') {
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: {
          body: `${message.title}\n\n${message.prompt}\n\n${message.options
            .map((option) => option.label)
            .join('\n')}`,
        },
      };
    }

    return {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: message.title,
        },
        body: {
          text: message.prompt,
        },
        action: {
          button: 'Select',
          sections: [
            {
              title: message.title,
              rows: message.options.map((option) => ({
                id: option.id,
                title: option.label,
              })),
            },
          ],
        },
      },
    };
  }
}
