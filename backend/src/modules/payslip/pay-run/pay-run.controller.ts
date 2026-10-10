import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { HrOfficerRole } from '../../../generated/prisma/enums';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PayRunService } from './pay-run.service';

@Controller('payslip/companies/:companyId/periods/:periodId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
export class PayRunController {
  constructor(private readonly payRunService: PayRunService) {}

  /**
   * GET /payslip/companies/:companyId/periods/:periodId/pay-run-state
   *
   * Returns the overall lifecycle state of the payroll run for a
   * company + period combination.
   */
  @Get('pay-run-state')
  getPayRunState(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('periodId', new ParseUUIDPipe()) periodId: string,
  ) {
    return this.payRunService.getPayRunState(companyId, periodId);
  }
}
