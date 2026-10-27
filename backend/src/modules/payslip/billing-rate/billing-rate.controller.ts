import {
  Controller,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HrOfficerRole } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { BillingRateService } from './billing-rate.service';
import { PayslipAuthorizationService } from '../payslip-authorization.service';
import { assertXlsxUpload, xlsxUploadOptions } from '../shared/xlsx-upload';

@Controller('payslip/billing-rate')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
export class BillingRateController {
  constructor(
    private readonly billingRateService: BillingRateService,
    private readonly authorization: PayslipAuthorizationService,
  ) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file', xlsxUploadOptions))
  async importBillingRate(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('accountingCompanyId', new ParseUUIDPipe())
    accountingCompanyId: string,
    @Query('payrollPeriodId', new ParseUUIDPipe()) payrollPeriodId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authorization.assertCompanyPeriod(
      accountingCompanyId,
      payrollPeriodId,
      user,
    );
    assertXlsxUpload(file);

    return this.billingRateService.importWorkbook(
      file.buffer,
      file.originalname,
      accountingCompanyId,
      payrollPeriodId,
      { actorType: 'HR_OFFICER', actorHrOfficerId: user.id },
    );
  }
}
