import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EscalationStatus } from '../../generated/prisma/enums';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardEscalationsService } from './dashboard-escalations.service';
import { EscalationActionDto } from './dashboard-escalations.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
  };
}

@Controller('dashboard/escalations')
@UseGuards(JwtAuthGuard)
export class DashboardEscalationsController {
  constructor(private readonly service: DashboardEscalationsService) {}

  @Get()
  list(
    @Query('status') status?: EscalationStatus,
    @Query('category') category?: string,
    @Query('documentType') documentType?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit === undefined ? undefined : Number(limit);
    return this.service.list({
      status,
      category,
      documentType,
      cursor,
      limit: parsedLimit,
    });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post(':id/claim')
  claim(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.service.claim(id, { hrOfficerId: request.user.id });
  }

  @Post(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: EscalationActionDto,
  ) {
    return this.service.resolve(id, {
      hrOfficerId: request.user.id,
      resolutionNote: body.resolutionNote,
    });
  }

  @Post(':id/close')
  close(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: EscalationActionDto,
  ) {
    return this.service.close(id, {
      hrOfficerId: request.user.id,
      resolutionNote: body.resolutionNote,
    });
  }
}
