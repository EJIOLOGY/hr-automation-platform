import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { EscalationStatus } from '../../generated/prisma/enums';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardHrRequestsService } from './dashboard-hr-requests.service';

@Controller('dashboard/hr-requests')
@UseGuards(JwtAuthGuard)
export class DashboardHrRequestsController {
  constructor(private readonly service: DashboardHrRequestsService) {}

  @Get()
  list(
    @Query('status') status?: EscalationStatus,
    @Query('documentType') documentType?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit === undefined ? undefined : Number(limit);

    return this.service.list({
      status,
      documentType,
      cursor,
      limit: parsedLimit,
    });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }
}
