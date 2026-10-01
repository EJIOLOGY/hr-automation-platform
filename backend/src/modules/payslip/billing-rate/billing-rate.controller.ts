import {
  BadRequestException,
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

@Controller('payslip/billing-rate')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
export class BillingRateController {
  constructor(private readonly billingRateService: BillingRateService) {}

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        const accepted =
          file.originalname.toLowerCase().endsWith('.xlsx') ||
          file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        callback(accepted ? null : new BadRequestException('Only .xlsx Billing Rate files are supported.'), accepted);
      },
    }),
  )
  async importBillingRate(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('accountingCompanyId', new ParseUUIDPipe()) accountingCompanyId: string,
    @Query('payrollPeriodId', new ParseUUIDPipe()) payrollPeriodId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('Billing Rate .xlsx file is required.');

    return this.billingRateService.importWorkbook(
      file.buffer,
      file.originalname,
      accountingCompanyId,
      payrollPeriodId,
      { actorType: 'HR_OFFICER', actorHrOfficerId: user.id },
    );
  }
}
