-- Backfill HELD status for CALCULATED payslips where reviewData decision is HOLD
UPDATE "Payslip"
SET "status" = 'HELD',
    "reviewNote" = COALESCE("reviewNote", "reviewData"->>'notes')
WHERE "status" = 'CALCULATED'
  AND "reviewData"->>'decision' = 'HOLD';

-- Copy reviewData->>'notes' to reviewNote where reviewNote is NULL
UPDATE "Payslip"
SET "reviewNote" = "reviewData"->>'notes'
WHERE "reviewNote" IS NULL
  AND "reviewData"->>'notes' IS NOT NULL;

-- Insert PayslipSettings singleton row if missing (idempotent)
INSERT INTO "PayslipSettings" ("id", "varianceThresholdPercent", "updatedAt")
VALUES ('default', 20, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
