import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { HrOfficerRole } from '../../../generated/prisma/enums';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator';
import { PayslipAuthorizationService } from '../payslip-authorization.service';
import { PayRunService } from './pay-run.service';

@Controller('payslip/companies/:companyId/periods/:periodId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
export class PayRunController {
  constructor(
    private readonly payRunService: PayRunService,
    private readonly authorization: PayslipAuthorizationService,
  ) {}

  /**
   * GET /payslip/companies/:companyId/periods/:periodId/pay-run-state
   *
   * Lifecycle state of the payroll run for a company + period. An Officer needs the claim on this exact
   * company and period (Admins always pass); the period must belong to the company.
   */
  @Get('pay-run-state')
  async getPayRunState(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('periodId', new ParseUUIDPipe()) periodId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authorization.assertCompanyPeriod(companyId, periodId, user);
    return this.payRunService.getPayRunState(companyId, periodId);
  }
}
