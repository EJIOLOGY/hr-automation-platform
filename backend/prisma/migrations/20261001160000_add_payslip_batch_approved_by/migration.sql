ALTER TABLE "PayslipBatch"
  ADD COLUMN IF NOT EXISTS "approvedById" TEXT,
  ADD CONSTRAINT "PayslipBatch_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "HrOfficer"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
