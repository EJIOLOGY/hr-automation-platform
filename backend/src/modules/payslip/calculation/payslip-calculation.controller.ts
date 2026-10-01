import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { HrOfficerRole } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PayslipCalculationService } from './payslip-calculation.service';

@Controller('payslip')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
export class PayslipCalculationController {
  constructor(private readonly calculationService: PayslipCalculationService) {}

  @Post('calculate/:uploadId')
  async calculateBatch(
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calculationService.calculateUpload(uploadId, {
      actorType: 'HR_OFFICER',
      actorHrOfficerId: user.id,
    });
  }

  @Get('batches/:batchId')
  async getBatchSummary(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
  ) {
    return this.calculationService.getBatchSummary(batchId);
  }
}
