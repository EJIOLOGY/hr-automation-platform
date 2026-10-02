import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { PayslipDashboardService } from './payslip-dashboard.service';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { HrOfficerRole, PayslipStatus } from '../../../generated/prisma/enums';
import { CorrectPayslipDto } from './correct-payslip.dto';
import { PayslipAuthorizationService } from '../payslip-authorization.service';

@Controller('payslip')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
export class PayslipDashboardController {
  constructor(private readonly dashboardService: PayslipDashboardService, private readonly authorization: PayslipAuthorizationService) {}

  @Get('dashboard')
  async getDashboard(@Query('periodId') periodId: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getPeriodRollup(periodId, user);
  }

  @Get('batches/:batchId/payslips')
  async getBatchPayslips(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
    @Query('status') status?: PayslipStatus,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    await this.authorization.assertBatch(batchId, user!);
    return this.dashboardService.getPayslipsForBatch(batchId, { limit, cursor, status });
  }

  @Patch(':payslipId/correct')
  async correctPayslip(
    @Param('payslipId', new ParseUUIDPipe()) payslipId: string,
    @Body() dto: CorrectPayslipDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authorization.assertPayslip(payslipId, user);
    return this.dashboardService.correctSinglePayslip(payslipId, dto, {
      actorType: 'HR_OFFICER',
      actorHrOfficerId: user.id,
    });
  }
}
