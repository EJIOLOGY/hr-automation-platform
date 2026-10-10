-- AlterTable
ALTER TABLE "PayslipBatch"
    ADD COLUMN "rejectionReason" TEXT,
    ADD COLUMN "rejectedAt" TIMESTAMP(3),
    ADD COLUMN "rejectedById" TEXT;

-- AlterTable
ALTER TABLE "Payslip"
    ADD COLUMN "reviewedById" TEXT,
    ADD COLUMN "reviewNote" TEXT,
    ADD COLUMN "changedSinceReview" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "approvedById" TEXT,
    ADD COLUMN "contentHash" TEXT,
    ADD COLUMN "carriedForward" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ReviewWorkbook"
    ADD COLUMN "batchVersion" INTEGER,
    ADD COLUMN "batchStateHash" TEXT,
    ADD COLUMN "exportedById" TEXT;

-- CreateTable
CREATE TABLE "PayslipBatchApproval" (
    "id" TEXT NOT NULL,
    "payslipBatchId" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "batchVersion" INTEGER NOT NULL,
    "approvedCount" INTEGER NOT NULL,
    "unresolvedCount" INTEGER NOT NULL,
    "partial" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayslipBatchApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewWorkbookPreview" (
    "id" TEXT NOT NULL,
    "payslipBatchId" TEXT NOT NULL,
    "reviewWorkbookId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "batchStateHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewWorkbookPreview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "varianceThresholdPercent" INTEGER NOT NULL DEFAULT 20,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayslipSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payslip_payslipBatchId_status_idx" ON "Payslip"("payslipBatchId", "status");

-- CreateIndex
CREATE INDEX "PayslipBatchApproval_payslipBatchId_idx" ON "PayslipBatchApproval"("payslipBatchId");

-- CreateIndex
CREATE INDEX "ReviewWorkbookPreview_payslipBatchId_createdAt_idx" ON "ReviewWorkbookPreview"("payslipBatchId", "createdAt");

-- AddForeignKey
ALTER TABLE "PayslipBatch" ADD CONSTRAINT "PayslipBatch_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "HrOfficer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "HrOfficer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "HrOfficer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipBatchApproval" ADD CONSTRAINT "PayslipBatchApproval_payslipBatchId_fkey" FOREIGN KEY ("payslipBatchId") REFERENCES "PayslipBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipBatchApproval" ADD CONSTRAINT "PayslipBatchApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "HrOfficer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewWorkbook" ADD CONSTRAINT "ReviewWorkbook_exportedById_fkey" FOREIGN KEY ("exportedById") REFERENCES "HrOfficer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewWorkbookPreview" ADD CONSTRAINT "ReviewWorkbookPreview_payslipBatchId_fkey" FOREIGN KEY ("payslipBatchId") REFERENCES "PayslipBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewWorkbookPreview" ADD CONSTRAINT "ReviewWorkbookPreview_reviewWorkbookId_fkey" FOREIGN KEY ("reviewWorkbookId") REFERENCES "ReviewWorkbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewWorkbookPreview" ADD CONSTRAINT "ReviewWorkbookPreview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "HrOfficer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipSettings" ADD CONSTRAINT "PayslipSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "HrOfficer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Claim rule: partial unique index (D-CLAIM1)
CREATE UNIQUE INDEX "PayslipWorkloadClaim_one_active_per_officer" ON "PayslipWorkloadClaim" ("claimedById") WHERE "claimedById" IS NOT NULL;
