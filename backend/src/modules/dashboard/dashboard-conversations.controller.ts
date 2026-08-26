import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardConversationsService } from './dashboard-conversations.service';
import { SendHrMessageDto } from './dashboard-conversations.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
}

@Controller('dashboard/conversations')
@UseGuards(JwtAuthGuard)
export class DashboardConversationsController {
  constructor(
    private readonly conversationsService: DashboardConversationsService,
  ) {}

  @Get()
  listConversations(
    @Query('limit', new ParseIntPipe({ optional: true }))
    limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.conversationsService.listConversations(limit, cursor);
  }

  @Get(':sessionId/messages')
  getMessages(
    @Param('sessionId') sessionId: string,
    @Query('limit', new ParseIntPipe({ optional: true }))
    limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.conversationsService.getMessages(sessionId, limit, cursor);
  }

  @Post(':sessionId/messages')
  sendMessage(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendHrMessageDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.conversationsService.replyToConversation(
      sessionId,
      request.user.id,
      dto.content,
    );
  }

  @Post(':sessionId/read')
  markRead(
    @Param('sessionId') sessionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.conversationsService.markConversationRead(
      sessionId,
      request.user.id,
    );
  }
}
