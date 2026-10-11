import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { HrOfficerRole } from '../../../generated/prisma/client';
import { PayslipRetentionSweepService } from './payslip-retention-sweep.service';

@Controller('payslip/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(HrOfficerRole.ADMIN)
export class PayslipAdminController {
  constructor(
    private readonly retentionSweep: PayslipRetentionSweepService,
  ) {}

  /**
   * POST /payslip/admin/retention-sweep
   * Admin-only: manually trigger the retention sweep to delete expired PDFs,
   * terminal deliveries from completed dispatches, and processed SES notification events
   * older than PAYSLIP_RETENTION_DAYS (default 20 days).
   */
  @Post('retention-sweep')
  @HttpCode(HttpStatus.OK)
  async triggerRetentionSweep(): Promise<{
    deletedPdfs: number;
    deletedDeliveries: number;
    deletedBlobs: number;
    deletedAttempts: number;
    deletedEvents: number;
  }> {
    return this.retentionSweep.runSweep();
  }
}
