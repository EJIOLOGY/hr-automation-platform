import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardConversationsService } from './dashboard-conversations.service';

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
}
