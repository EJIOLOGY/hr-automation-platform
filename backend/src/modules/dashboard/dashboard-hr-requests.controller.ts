import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HrRequestListQueryDto } from './dashboard-hr-requests.dto';
import { DashboardHrRequestsService } from './dashboard-hr-requests.service';

@Controller('dashboard/hr-requests')
@UseGuards(JwtAuthGuard)
export class DashboardHrRequestsController {
  constructor(private readonly service: DashboardHrRequestsService) {}

  @Get()
  list(@Query() query: HrRequestListQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }
}
