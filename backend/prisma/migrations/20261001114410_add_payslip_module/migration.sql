-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "escalationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_escalationId_key" ON "Feedback"("escalationId");

-- CreateIndex
CREATE INDEX "Feedback_sessionId_idx" ON "Feedback"("sessionId");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_escalationId_fkey" FOREIGN KEY ("escalationId") REFERENCES "Escalation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "BillingRateRow_upload_idx" RENAME TO "BillingRateRow_billingRateUploadId_idx";

-- RenameIndex
ALTER INDEX "BillingRateRow_upload_rowNumber_key" RENAME TO "BillingRateRow_billingRateUploadId_rowNumber_key";

-- RenameIndex
ALTER INDEX "BillingRateUpload_company_period_idx" RENAME TO "BillingRateUpload_accountingCompanyId_payrollPeriodId_idx";

-- RenameIndex
ALTER INDEX "BillingRateUpload_company_period_version_key" RENAME TO "BillingRateUpload_accountingCompanyId_payrollPeriodId_versi_key";

-- RenameIndex
ALTER INDEX "PayrollPeriod_company_dates_key" RENAME TO "PayrollPeriod_accountingCompanyId_startDate_endDate_key";

-- RenameIndex
ALTER INDEX "PayrollPeriod_dates_idx" RENAME TO "PayrollPeriod_startDate_endDate_idx";

-- RenameIndex
ALTER INDEX "Payslip_batch_staffId_key" RENAME TO "Payslip_payslipBatchId_staffId_key";

-- RenameIndex
ALTER INDEX "PayslipBatch_company_period_idx" RENAME TO "PayslipBatch_accountingCompanyId_payrollPeriodId_idx";

-- RenameIndex
ALTER INDEX "PayslipBatch_company_period_version_key" RENAME TO "PayslipBatch_accountingCompanyId_payrollPeriodId_version_key";

-- RenameIndex
ALTER INDEX "PayslipBatch_upload_idx" RENAME TO "PayslipBatch_billingRateUploadId_idx";
