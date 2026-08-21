-- CreateEnum
CREATE TYPE "HrOfficerRole" AS ENUM ('ADMIN', 'OFFICER');

-- CreateEnum
CREATE TYPE "HrOfficerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "sentByHrOfficerId" TEXT;

-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "lastReadByHrAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Escalation" ADD COLUMN     "assignedHrOfficerId" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "documentType" TEXT,
ADD COLUMN     "resolutionNote" TEXT;

-- CreateTable
CREATE TABLE "HrOfficer" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "HrOfficerRole" NOT NULL DEFAULT 'OFFICER',
    "status" "HrOfficerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrOfficer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorHrOfficerId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HrOfficer_email_key" ON "HrOfficer"("email");

-- CreateIndex
CREATE INDEX "HrOfficer_role_idx" ON "HrOfficer"("role");

-- CreateIndex
CREATE INDEX "HrOfficer_status_idx" ON "HrOfficer"("status");

-- CreateIndex
CREATE INDEX "AuditLog_actorHrOfficerId_idx" ON "AuditLog"("actorHrOfficerId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_sentByHrOfficerId_idx" ON "ChatMessage"("sentByHrOfficerId");

-- CreateIndex
CREATE INDEX "ChatSession_lastReadByHrAt_idx" ON "ChatSession"("lastReadByHrAt");

-- CreateIndex
CREATE INDEX "Escalation_assignedHrOfficerId_idx" ON "Escalation"("assignedHrOfficerId");

-- CreateIndex
CREATE INDEX "Escalation_category_idx" ON "Escalation"("category");

-- CreateIndex
CREATE INDEX "Escalation_documentType_idx" ON "Escalation"("documentType");

-- CreateIndex
CREATE INDEX "Escalation_createdAt_idx" ON "Escalation"("createdAt");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sentByHrOfficerId_fkey" FOREIGN KEY ("sentByHrOfficerId") REFERENCES "HrOfficer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_assignedHrOfficerId_fkey" FOREIGN KEY ("assignedHrOfficerId") REFERENCES "HrOfficer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorHrOfficerId_fkey" FOREIGN KEY ("actorHrOfficerId") REFERENCES "HrOfficer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
