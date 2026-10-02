import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { BillingRateModule } from './billing-rate/billing-rate.module';
import { PayslipCalculationController } from './calculation/payslip-calculation.controller';
import { PayslipCalculationService } from './calculation/payslip-calculation.service';
import { PdfModule } from './pdf/pdf.module';
import { PayslipApprovalService } from './approval/payslip-approval.service';
import { PayslipRenderService } from './pdf/payslip-render.service';
import { PayslipPdfController } from './pdf/payslip-pdf.controller';
import { ReviewWorkbookController } from './review/review-workbook.controller';
import { ReviewWorkbookService } from './review/review-workbook.service';
import { PayslipDashboardController } from './dashboard/payslip-dashboard.controller';
import { PayslipDashboardService } from './dashboard/payslip-dashboard.service';
import { PayslipAuthorizationService } from './payslip-authorization.service';
import { PayslipClaimController } from './payslip-claim.controller';

@Module({
  imports: [BillingRateModule, PrismaModule, AuditModule, PdfModule],
  controllers: [
    PayslipCalculationController, 
    PayslipPdfController, 
    ReviewWorkbookController, 
    PayslipDashboardController, PayslipClaimController
  ],
  providers: [
    PayslipCalculationService, 
    PayslipApprovalService, 
    PayslipRenderService, 
    ReviewWorkbookService, 
    PayslipDashboardService, PayslipAuthorizationService
  ],
  exports: [
    PayslipCalculationService, 
    PayslipApprovalService, 
    ReviewWorkbookService, 
    PayslipDashboardService
  ],
})
export class PayslipModule {}
