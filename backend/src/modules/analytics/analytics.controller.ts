import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsQueryDto } from './analytics-query.dto';
import { AnalyticsQueryService } from './analytics-query.service';

@Controller('dashboard/analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly queryService: AnalyticsQueryService) {}

  @Get('overview')
  getOverview(@Query() query: AnalyticsQueryDto) {
    return this.queryService.getOverview(query);
  }

  @Get('conversation-activity')
  getConversationActivity(@Query() query: AnalyticsQueryDto) {
    return this.queryService.getConversationActivity(query);
  }

  @Get('hr-services')
  getHrServices(@Query() query: AnalyticsQueryDto) {
    return this.queryService.getHrServices(query);
  }

  @Get('journey')
  getJourney(@Query() query: AnalyticsQueryDto) {
    return this.queryService.getJourney(query);
  }

  @Get('escalations')
  getEscalations(@Query() query: AnalyticsQueryDto) {
    return this.queryService.getEscalations(query);
  }

  @Get('top-paths')
  getTopPaths(@Query() query: AnalyticsQueryDto) {
    return this.queryService.getTopPaths(query);
  }

  @Get('unrecognized-inputs')
  getUnrecognizedInputs(@Query() query: AnalyticsQueryDto) {
    return this.queryService.getUnrecognizedInputs(query);
  }

  @Get('export')
  async export(@Query() query: AnalyticsQueryDto, @Res() response: Response) {
    const csv = await this.queryService.getExport(query);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="analytics-export.csv"',
    );
    response.send(csv);
  }
}
