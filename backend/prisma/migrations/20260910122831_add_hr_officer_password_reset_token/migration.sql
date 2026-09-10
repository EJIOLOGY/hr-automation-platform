-- AlterTable
ALTER TABLE "HrOfficer" ADD COLUMN     "passwordResetTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetTokenHash" TEXT;

-- CreateIndex
CREATE INDEX "HrOfficer_passwordResetTokenHash_idx" ON "HrOfficer"("passwordResetTokenHash");
