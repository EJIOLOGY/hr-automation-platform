import { Body, Controller, Post } from '@nestjs/common';
import { ConversationService } from './chat.service';

@Controller('conversation')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post('message')
  async handleMessage(
    @Body('phoneNumber') phoneNumber: string,
    @Body('message') message: string,
  ) {
    return this.conversationService.handleMessage(phoneNumber, message);
  }
}
