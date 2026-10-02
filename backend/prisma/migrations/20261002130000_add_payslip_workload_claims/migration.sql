CREATE TABLE "PayslipWorkloadClaim" (
  "id" TEXT NOT NULL, "accountingCompanyId" TEXT NOT NULL, "payrollPeriodId" TEXT NOT NULL,
  "claimedById" TEXT, "claimedAt" TIMESTAMP(3), "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayslipWorkloadClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayslipWorkloadClaim_accountingCompanyId_payrollPeriodId_key" ON "PayslipWorkloadClaim"("accountingCompanyId", "payrollPeriodId");
CREATE INDEX "PayslipWorkloadClaim_claimedById_idx" ON "PayslipWorkloadClaim"("claimedById");
ALTER TABLE "PayslipWorkloadClaim" ADD CONSTRAINT "PayslipWorkloadClaim_accountingCompanyId_fkey" FOREIGN KEY ("accountingCompanyId") REFERENCES "AccountingCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayslipWorkloadClaim" ADD CONSTRAINT "PayslipWorkloadClaim_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayslipWorkloadClaim" ADD CONSTRAINT "PayslipWorkloadClaim_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "HrOfficer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
