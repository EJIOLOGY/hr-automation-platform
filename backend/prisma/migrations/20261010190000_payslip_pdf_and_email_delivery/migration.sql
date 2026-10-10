-- CreateEnum
CREATE TYPE "PayslipPdfStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PayslipDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUBMITTED', 'DELIVERED', 'DELIVERY_DELAYED', 'RETRY_SCHEDULED', 'BOUNCED_SOFT', 'BOUNCED_HARD', 'COMPLAINED', 'REJECTED', 'FAILED', 'SUBMISSION_UNKNOWN', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayslipDeliveryAttemptOutcome" AS ENUM ('ACCEPTED', 'CONFIRMED_FAILURE', 'SUBMISSION_UNKNOWN');

-- CreateEnum
CREATE TYPE "PayslipDeliveryAttemptTrigger" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "PayslipEmailDispatchStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'SENDING', 'PAUSED', 'COMPLETED', 'COMPLETED_WITH_FAILURES', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayslipEmailDispatchMode" AS ENUM ('LIVE', 'TEST');

-- CreateEnum
CREATE TYPE "EmailSuppressionReason" AS ENUM ('HARD_BOUNCE', 'COMPLAINT', 'SES_ACCOUNT_LIST');

-- CreateEnum
CREATE TYPE "EmailSuppressionStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- AlterTable
ALTER TABLE "Employee"
    ADD COLUMN "email" TEXT,
    ADD COLUMN "emailUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Employee_email_idx" ON "Employee"("email");

-- CreateTable
CREATE TABLE "PayslipPdfBlob" (
    "id" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayslipPdfBlob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipPdf" (
    "id" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "status" "PayslipPdfStatus" NOT NULL DEFAULT 'PENDING',
    "blobId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "generatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayslipPdf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipEmailDispatch" (
    "id" TEXT NOT NULL,
    "payslipBatchId" TEXT NOT NULL,
    "status" "PayslipEmailDispatchStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "mode" "PayslipEmailDispatchMode" NOT NULL DEFAULT 'LIVE',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "includeCarriedForward" BOOLEAN NOT NULL DEFAULT false,
    "pauseReason" TEXT,
    "blockedReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayslipEmailDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipDelivery" (
    "id" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "payslipBatchId" TEXT NOT NULL,
    "accountingCompanyId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "employeeId" TEXT,
    "dispatchId" TEXT,
    "status" "PayslipDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "isCorrection" BOOLEAN NOT NULL DEFAULT false,
    "correctsDeliveryId" TEXT,
    "recipientEmailSnapshot" TEXT,
    "recipientMasked" TEXT,
    "contentHash" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "autoRetryCount" INTEGER NOT NULL DEFAULT 0,
    "softBounceRetryCount" INTEGER NOT NULL DEFAULT 0,
    "sesMessageId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayslipDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "trigger" "PayslipDeliveryAttemptTrigger" NOT NULL,
    "triggeredByHrOfficerId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "outcome" "PayslipDeliveryAttemptOutcome",
    "sesMessageId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayslipDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesNotificationEvent" (
    "id" TEXT NOT NULL,
    "snsMessageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sesMessageId" TEXT,
    "deliveryId" TEXT,
    "eventTimestamp" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingOutcome" TEXT,
    "processingError" TEXT,
    "minimalPayload" JSONB NOT NULL,

    CONSTRAINT "SesNotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "emailMasked" TEXT NOT NULL,
    "reason" "EmailSuppressionReason" NOT NULL,
    "status" "EmailSuppressionStatus" NOT NULL DEFAULT 'ACTIVE',
    "detail" TEXT,
    "createdFromDeliveryId" TEXT,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayslipPdfBlob_contentHash_templateVersion_key" ON "PayslipPdfBlob"("contentHash", "templateVersion");

-- CreateIndex
CREATE UNIQUE INDEX "PayslipPdf_payslipId_key" ON "PayslipPdf"("payslipId");

-- CreateIndex
CREATE INDEX "PayslipPdf_status_idx" ON "PayslipPdf"("status");

-- CreateIndex
CREATE INDEX "PayslipPdf_expiresAt_idx" ON "PayslipPdf"("expiresAt");

-- CreateIndex
CREATE INDEX "PayslipEmailDispatch_payslipBatchId_idx" ON "PayslipEmailDispatch"("payslipBatchId");

-- CreateIndex
CREATE INDEX "PayslipEmailDispatch_status_idx" ON "PayslipEmailDispatch"("status");

-- CreateIndex
CREATE INDEX "PayslipDelivery_payslipBatchId_status_idx" ON "PayslipDelivery"("payslipBatchId", "status");

-- CreateIndex
CREATE INDEX "PayslipDelivery_dispatchId_status_idx" ON "PayslipDelivery"("dispatchId", "status");

-- CreateIndex
CREATE INDEX "PayslipDelivery_status_nextAttemptAt_idx" ON "PayslipDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "PayslipDelivery_sesMessageId_idx" ON "PayslipDelivery"("sesMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "PayslipDeliveryAttempt_deliveryId_attemptNumber_key" ON "PayslipDeliveryAttempt"("deliveryId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SesNotificationEvent_snsMessageId_key" ON "SesNotificationEvent"("snsMessageId");

-- CreateIndex
CREATE INDEX "SesNotificationEvent_sesMessageId_idx" ON "SesNotificationEvent"("sesMessageId");

-- CreateIndex
CREATE INDEX "SesNotificationEvent_deliveryId_idx" ON "SesNotificationEvent"("deliveryId");

-- CreateIndex
CREATE INDEX "SesNotificationEvent_processedAt_idx" ON "SesNotificationEvent"("processedAt");

-- CreateIndex
CREATE INDEX "EmailSuppression_emailNormalized_status_idx" ON "EmailSuppression"("emailNormalized", "status");

-- CreateIndex
CREATE INDEX "EmailSuppression_status_acknowledgedAt_idx" ON "EmailSuppression"("status", "acknowledgedAt");

-- AddForeignKey
ALTER TABLE "PayslipPdf" ADD CONSTRAINT "PayslipPdf_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipPdf" ADD CONSTRAINT "PayslipPdf_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "PayslipPdfBlob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipEmailDispatch" ADD CONSTRAINT "PayslipEmailDispatch_payslipBatchId_fkey" FOREIGN KEY ("payslipBatchId") REFERENCES "PayslipBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipEmailDispatch" ADD CONSTRAINT "PayslipEmailDispatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "HrOfficer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipEmailDispatch" ADD CONSTRAINT "PayslipEmailDispatch_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "HrOfficer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipDelivery" ADD CONSTRAINT "PayslipDelivery_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipDelivery" ADD CONSTRAINT "PayslipDelivery_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipDelivery" ADD CONSTRAINT "PayslipDelivery_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "PayslipEmailDispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipDeliveryAttempt" ADD CONSTRAINT "PayslipDeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "PayslipDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "HrOfficer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "HrOfficer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- D-ONEPER: Raw-SQL partial unique index (TEST deliveries exempt)
CREATE UNIQUE INDEX "PayslipDelivery_one_live_per_payslip" ON "PayslipDelivery" ("payslipId") WHERE "isTest" = false;
