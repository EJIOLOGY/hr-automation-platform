-- CreateEnum
CREATE TYPE "AllowanceClass" AS ENUM ('PAYSLIP_MAPPED_TAXABLE', 'PAYSLIP_MAPPED_NONTAXABLE', 'IGNORED', 'MANUAL', 'UNMAPPED');

-- CreateEnum
CREATE TYPE "PayslipLineKind" AS ENUM ('BASE', 'ARREARS');

-- AlterTable
ALTER TABLE "PayrollPeriod" ADD COLUMN     "month" TEXT,
ADD COLUMN     "year" INTEGER;

-- CreateTable
CREATE TABLE "AllowanceDefinition" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "sourceSheet" TEXT NOT NULL,
    "sourceHeader" TEXT NOT NULL,
    "classification" "AllowanceClass" NOT NULL,
    "affectsGrossEarnings" BOOLEAN NOT NULL DEFAULT false,
    "affectsNetServiceFee" BOOLEAN NOT NULL DEFAULT false,
    "supportsArrears" BOOLEAN NOT NULL DEFAULT false,
    "displayLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllowanceDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipLine" (
    "id" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "allowanceDefinitionId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "PayslipLineKind" NOT NULL,
    "parentLineId" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "taxClass" "AllowanceClass" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceCell" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayslipLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewWorkbook" (
    "id" TEXT NOT NULL,
    "payslipBatchId" TEXT NOT NULL,
    "exportHash" TEXT NOT NULL,
    "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reuploadedAt" TIMESTAMP(3),
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewWorkbook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AllowanceDefinition_canonicalName_key" ON "AllowanceDefinition"("canonicalName");

-- CreateIndex
CREATE INDEX "AllowanceDefinition_classification_idx" ON "AllowanceDefinition"("classification");

-- CreateIndex
CREATE INDEX "AllowanceDefinition_canonicalName_idx" ON "AllowanceDefinition"("canonicalName");

-- CreateIndex
CREATE INDEX "PayslipLine_payslipId_idx" ON "PayslipLine"("payslipId");

-- CreateIndex
CREATE INDEX "PayslipLine_allowanceDefinitionId_idx" ON "PayslipLine"("allowanceDefinitionId");

-- CreateIndex
CREATE INDEX "PayslipLine_parentLineId_idx" ON "PayslipLine"("parentLineId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewWorkbook_exportHash_key" ON "ReviewWorkbook"("exportHash");

-- CreateIndex
CREATE INDEX "ReviewWorkbook_payslipBatchId_idx" ON "ReviewWorkbook"("payslipBatchId");

-- AddForeignKey
ALTER TABLE "PayslipLine" ADD CONSTRAINT "PayslipLine_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipLine" ADD CONSTRAINT "PayslipLine_allowanceDefinitionId_fkey" FOREIGN KEY ("allowanceDefinitionId") REFERENCES "AllowanceDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipLine" ADD CONSTRAINT "PayslipLine_parentLineId_fkey" FOREIGN KEY ("parentLineId") REFERENCES "PayslipLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewWorkbook" ADD CONSTRAINT "ReviewWorkbook_payslipBatchId_fkey" FOREIGN KEY ("payslipBatchId") REFERENCES "PayslipBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
