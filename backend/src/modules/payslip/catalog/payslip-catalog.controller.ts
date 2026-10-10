import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { HrOfficerRole } from '../../../generated/prisma/enums';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreatePeriodDto } from './dto/create-period.dto';
import { ReassignClaimDto } from './dto/reassign-claim.dto';
import { PayslipCatalogService } from './payslip-catalog.service';

@Controller('payslip')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayslipCatalogController {
  constructor(private readonly catalogService: PayslipCatalogService) {}

  @Get('companies')
  @Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
  async listCompanies() {
    return this.catalogService.listCompanies();
  }

  @Post('companies')
  @Roles(HrOfficerRole.ADMIN)
  async createCompany(
    @Body() dto: CreateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogService.createCompany(dto, user);
  }

  @Get('periods')
  @Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
  async listPeriods(@Query('companyId') companyId?: string) {
    return this.catalogService.listPeriods(companyId);
  }

  @Post('periods')
  @Roles(HrOfficerRole.ADMIN)
  async createPeriod(
    @Body() dto: CreatePeriodDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogService.createPeriod(dto, user);
  }

  @Get('companies/:companyId/periods/:periodId/claim')
  @Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
  async getPeriodClaim(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('periodId', new ParseUUIDPipe()) periodId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogService.getPeriodClaim(companyId, periodId, user.id);
  }

  @Post('companies/:companyId/periods/:periodId/reassign')
  @Roles(HrOfficerRole.ADMIN)
  async reassignClaim(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('periodId', new ParseUUIDPipe()) periodId: string,
    @Body() dto: ReassignClaimDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogService.reassignClaim(companyId, periodId, dto, user);
  }

  @Get('claims/mine')
  @Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
  async getMyClaims(@CurrentUser() user: AuthenticatedUser) {
    return this.catalogService.getMyClaims(user);
  }
}
