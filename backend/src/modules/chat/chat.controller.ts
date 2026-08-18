import { Body, Controller, Post } from '@nestjs/common';
import { ConversationService } from './chat.service';
import { SendConversationMessageDto } from './dto/send-conversation-message.dto';

@Controller('conversation')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post('message')
  async handleMessage(@Body() body: SendConversationMessageDto) {
    return this.conversationService.handleMessage({
      senderPhoneNumber: body.phoneNumber,
      input: {
        kind: 'text',
        value: body.message,
      },
    });
  }
}
