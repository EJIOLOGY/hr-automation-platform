import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardEscalationsService } from './dashboard-escalations.service';
import {
  EscalationActionDto,
  EscalationListQueryDto,
} from './dashboard-escalations.dto';

@Controller('dashboard/escalations')
@UseGuards(JwtAuthGuard)
export class DashboardEscalationsController {
  constructor(private readonly service: DashboardEscalationsService) {}

  @Get()
  list(@Query() query: EscalationListQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post(':id/claim')
  claim(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.claim(id, { hrOfficerId: user.id });
  }

  @Post(':id/resolve')
  resolve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: EscalationActionDto,
  ) {
    return this.service.resolve(id, {
      hrOfficerId: user.id,
      resolutionNote: body.resolutionNote,
    });
  }

  @Post(':id/close')
  close(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: EscalationActionDto,
  ) {
    return this.service.close(id, {
      hrOfficerId: user.id,
      resolutionNote: body.resolutionNote,
    });
  }
}
