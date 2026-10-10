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
import { ReviewWorkbookPreviewService } from './review/review-workbook-preview.service';
import { PayslipDashboardController } from './dashboard/payslip-dashboard.controller';
import { PayslipDashboardService } from './dashboard/payslip-dashboard.service';
import { PayslipAuthorizationService } from './payslip-authorization.service';
import { PayslipClaimController } from './payslip-claim.controller';
import { PayslipCatalogController } from './catalog/payslip-catalog.controller';
import { PayslipCatalogService } from './catalog/payslip-catalog.service';
import { ReviewDecisionService } from './review/review-decision.service';
import { PayslipCorrectionService } from './correction/payslip-correction.service';
import { PayRunController } from './pay-run/pay-run.controller';
import { PayRunService } from './pay-run/pay-run.service';
import { PostgresPayslipPdfStorage } from './pdf/payslip-pdf-storage';
import { PdfGenerationService } from './pdf/pdf-generation.service';
import { PayslipPdfBundleService } from './pdf/payslip-pdf-bundle.service';
import { PAYSLIP_POST_APPROVAL_HOOKS } from './shared/post-approval-hook';
import {
  PayslipPdfReader,
  PayslipPdfGenerationRequester,
  PayslipPdfRetentionPin,
} from './pdf/payslip-pdf-reader.interface';
import { PayslipEmailSenderService } from './email/payslip-email-sender.service';
import { PayslipDeliveryWorkerService } from './email/payslip-delivery-worker.service';
import { PayslipEmailDispatchController } from './email/payslip-email-dispatch.controller';

@Module({
  imports: [BillingRateModule, PrismaModule, AuditModule, PdfModule],
  controllers: [
    PayslipCalculationController,
    PayslipPdfController,
    ReviewWorkbookController,
    PayslipDashboardController,
    PayslipClaimController,
    PayslipCatalogController,
    PayRunController,
    PayslipEmailDispatchController,
  ],
  providers: [
    PayslipCalculationService,
    PayslipApprovalService,
    PayslipRenderService,
    PostgresPayslipPdfStorage,
    PdfGenerationService,
    PayslipPdfBundleService,
    PayslipEmailSenderService,
    PayslipDeliveryWorkerService,
    {
      provide: PayslipPdfReader,
      useExisting: PdfGenerationService,
    },
    {
      provide: PayslipPdfGenerationRequester,
      useExisting: PdfGenerationService,
    },
    {
      provide: PayslipPdfRetentionPin,
      useExisting: PdfGenerationService,
    },
    {
      provide: PAYSLIP_POST_APPROVAL_HOOKS,
      useFactory: (pdfGen: PdfGenerationService) => [pdfGen],
      inject: [PdfGenerationService],
    },
    ReviewWorkbookService,
    ReviewWorkbookPreviewService,
    ReviewDecisionService,
    PayslipDashboardService,
    PayslipCorrectionService,
    PayslipAuthorizationService,
    PayslipCatalogService,
    PayRunService,
  ],
  exports: [
    PayslipCalculationService,
    PayslipApprovalService,
    ReviewWorkbookService,
    ReviewWorkbookPreviewService,
    ReviewDecisionService,
    PayslipDashboardService,
    PayslipCorrectionService,
    PayslipAuthorizationService,
    PayslipCatalogService,
    PayRunService,
    PayslipPdfReader,
    PayslipPdfGenerationRequester,
    PayslipPdfRetentionPin,
    PdfGenerationService,
    PayslipPdfBundleService,
    PayslipEmailSenderService,
    PayslipDeliveryWorkerService,
  ],
})
export class PayslipModule {}


