CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "BillingRateUploadStatus" AS ENUM ('UPLOADED', 'VALIDATED', 'REJECTED', 'APPROVED');
CREATE TYPE "PayslipBatchStatus" AS ENUM ('DRAFT', 'CALCULATED', 'IN_REVIEW', 'APPROVED', 'REJECTED');
CREATE TYPE "PayslipStatus" AS ENUM ('CALCULATED', 'IN_REVIEW', 'APPROVED', 'REJECTED');

CREATE TABLE "AccountingCompany" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingCompany_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollPeriod" (
  "id" TEXT NOT NULL,
  "accountingCompanyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingRateUpload" (
  "id" TEXT NOT NULL,
  "accountingCompanyId" TEXT NOT NULL,
  "payrollPeriodId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "BillingRateUploadStatus" NOT NULL DEFAULT 'UPLOADED',
  "fileName" TEXT NOT NULL,
  "sourceFileHash" TEXT,
  "uploadedById" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "validRowCount" INTEGER NOT NULL DEFAULT 0,
  "invalidRowCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingRateUpload_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingRateRow" (
  "id" TEXT NOT NULL,
  "billingRateUploadId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "staffId" TEXT NOT NULL,
  "employeeId" TEXT,
  "rawData" JSONB NOT NULL,
  "normalizedData" JSONB,
  "validationErrors" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingRateRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayslipBatch" (
  "id" TEXT NOT NULL,
  "accountingCompanyId" TEXT NOT NULL,
  "payrollPeriodId" TEXT NOT NULL,
  "billingRateUploadId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "PayslipBatchStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "calculatedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayslipBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payslip" (
  "id" TEXT NOT NULL,
  "payslipBatchId" TEXT NOT NULL,
  "billingRateRowId" TEXT NOT NULL,
  "employeeId" TEXT,
  "staffId" TEXT NOT NULL,
  "status" "PayslipStatus" NOT NULL DEFAULT 'CALCULATED',
  "calculationInputs" JSONB NOT NULL,
  "calculationOutputs" JSONB NOT NULL,
  "reviewData" JSONB,
  "reviewedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingCompany_name_key" ON "AccountingCompany"("name");
CREATE UNIQUE INDEX "AccountingCompany_code_key" ON "AccountingCompany"("code");
CREATE INDEX "AccountingCompany_isActive_idx" ON "AccountingCompany"("isActive");
CREATE UNIQUE INDEX "PayrollPeriod_company_dates_key" ON "PayrollPeriod"("accountingCompanyId", "startDate", "endDate");
CREATE INDEX "PayrollPeriod_accountingCompanyId_idx" ON "PayrollPeriod"("accountingCompanyId");
CREATE INDEX "PayrollPeriod_status_idx" ON "PayrollPeriod"("status");
CREATE INDEX "PayrollPeriod_dates_idx" ON "PayrollPeriod"("startDate", "endDate");
CREATE UNIQUE INDEX "BillingRateUpload_company_period_version_key" ON "BillingRateUpload"("accountingCompanyId", "payrollPeriodId", "version");
CREATE INDEX "BillingRateUpload_company_period_idx" ON "BillingRateUpload"("accountingCompanyId", "payrollPeriodId");
CREATE INDEX "BillingRateUpload_status_idx" ON "BillingRateUpload"("status");
CREATE INDEX "BillingRateUpload_uploadedById_idx" ON "BillingRateUpload"("uploadedById");
CREATE INDEX "BillingRateUpload_createdAt_idx" ON "BillingRateUpload"("createdAt");
CREATE UNIQUE INDEX "BillingRateRow_upload_rowNumber_key" ON "BillingRateRow"("billingRateUploadId", "rowNumber");
CREATE INDEX "BillingRateRow_staffId_idx" ON "BillingRateRow"("staffId");
CREATE INDEX "BillingRateRow_employeeId_idx" ON "BillingRateRow"("employeeId");
CREATE INDEX "BillingRateRow_upload_idx" ON "BillingRateRow"("billingRateUploadId");
CREATE UNIQUE INDEX "PayslipBatch_company_period_version_key" ON "PayslipBatch"("accountingCompanyId", "payrollPeriodId", "version");
CREATE INDEX "PayslipBatch_company_period_idx" ON "PayslipBatch"("accountingCompanyId", "payrollPeriodId");
CREATE INDEX "PayslipBatch_upload_idx" ON "PayslipBatch"("billingRateUploadId");
CREATE INDEX "PayslipBatch_status_idx" ON "PayslipBatch"("status");
CREATE INDEX "PayslipBatch_createdById_idx" ON "PayslipBatch"("createdById");
CREATE INDEX "PayslipBatch_createdAt_idx" ON "PayslipBatch"("createdAt");
CREATE UNIQUE INDEX "Payslip_batch_staffId_key" ON "Payslip"("payslipBatchId", "staffId");
CREATE INDEX "Payslip_staffId_idx" ON "Payslip"("staffId");
CREATE INDEX "Payslip_employeeId_idx" ON "Payslip"("employeeId");
CREATE INDEX "Payslip_billingRateRowId_idx" ON "Payslip"("billingRateRowId");
CREATE INDEX "Payslip_status_idx" ON "Payslip"("status");
CREATE INDEX "Payslip_createdAt_idx" ON "Payslip"("createdAt");

ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_accountingCompanyId_fkey" FOREIGN KEY ("accountingCompanyId") REFERENCES "AccountingCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingRateUpload" ADD CONSTRAINT "BillingRateUpload_accountingCompanyId_fkey" FOREIGN KEY ("accountingCompanyId") REFERENCES "AccountingCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingRateUpload" ADD CONSTRAINT "BillingRateUpload_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingRateUpload" ADD CONSTRAINT "BillingRateUpload_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "HrOfficer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingRateRow" ADD CONSTRAINT "BillingRateRow_billingRateUploadId_fkey" FOREIGN KEY ("billingRateUploadId") REFERENCES "BillingRateUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingRateRow" ADD CONSTRAINT "BillingRateRow_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayslipBatch" ADD CONSTRAINT "PayslipBatch_accountingCompanyId_fkey" FOREIGN KEY ("accountingCompanyId") REFERENCES "AccountingCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayslipBatch" ADD CONSTRAINT "PayslipBatch_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayslipBatch" ADD CONSTRAINT "PayslipBatch_billingRateUploadId_fkey" FOREIGN KEY ("billingRateUploadId") REFERENCES "BillingRateUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayslipBatch" ADD CONSTRAINT "PayslipBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "HrOfficer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payslipBatchId_fkey" FOREIGN KEY ("payslipBatchId") REFERENCES "PayslipBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_billingRateRowId_fkey" FOREIGN KEY ("billingRateRowId") REFERENCES "BillingRateRow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
