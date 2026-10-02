ALTER TABLE "Payslip" ADD COLUMN IF NOT EXISTS "supersedesPayslipId" TEXT;

ALTER TABLE "Payslip"
  ADD CONSTRAINT "Payslip_supersedesPayslipId_fkey"
  FOREIGN KEY ("supersedesPayslipId") REFERENCES "Payslip"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Payslip_supersedesPayslipId_idx"
  ON "Payslip"("supersedesPayslipId");
