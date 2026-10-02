import { Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PayslipAuthorizationService } from './payslip-authorization.service';

@Controller('payslip')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayslipClaimController {
  constructor(private readonly authorization: PayslipAuthorizationService) {}
  @Post('companies/:companyId/periods/:periodId/claim')
  claim(@Param('companyId', new ParseUUIDPipe()) companyId: string, @Param('periodId', new ParseUUIDPipe()) periodId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authorization.claim(companyId, periodId, user);
  }
  @Post('companies/:companyId/periods/:periodId/release')
  release(@Param('companyId', new ParseUUIDPipe()) companyId: string, @Param('periodId', new ParseUUIDPipe()) periodId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authorization.release(companyId, periodId, user);
  }
}
