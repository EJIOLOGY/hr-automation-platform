import { BillingRateUploadStatus, PayslipBatchStatus } from '../../../generated/prisma/client';

export type PayRunState =
  | 'NOT_STARTED'
  | 'UPLOAD_REJECTED'
  | 'VALIDATED'
  | 'CALCULATED'
  | 'IN_REVIEW'
  | 'READY_FOR_APPROVAL'
  | 'BLOCKED'
  | 'PARTIALLY_APPROVED'
  | 'CORRECTION_IN_PROGRESS'
  | 'APPROVED'
  | 'REJECTED';

export interface PayRunBatchInput {
  id: string;
  version: number;
  status: PayslipBatchStatus;
  earlierVersionHasApprovedPayslips?: boolean;
}

export interface PayRunUploadInput {
  id: string;
  version: number;
  status: BillingRateUploadStatus;
}

export interface PayslipCountsInput {
  total: number;
  CALCULATED: number;
  IN_REVIEW: number;
  HELD: number;
  REJECTED: number;
  APPROVED: number;
}

export interface DerivePayRunStateInput {
  latestUpload: PayRunUploadInput | null;
  latestBatch: PayRunBatchInput | null;
  counts: PayslipCountsInput | null;
}

/**
 * Derives the overall lifecycle state of a payroll run for a company-period.
 *
 * Precedence Rules:
 * 1. NOT_STARTED: No upload exists.
 * 2. If a batch exists:
 *    a. APPROVED: Latest batch status is APPROVED.
 *    b. REJECTED: Latest batch status is REJECTED.
 *    c. CORRECTION_IN_PROGRESS: Latest batch version > 1, not APPROVED/REJECTED,
 *       and an earlier version has approved payslips (beats IN_REVIEW, READY_FOR_APPROVAL, PARTIALLY_APPROVED).
 *    d. PARTIALLY_APPROVED: Latest batch is PARTIALLY_APPROVED (and version 1).
 *    e. READY_FOR_APPROVAL: No CALCULATED payslips and at least 1 IN_REVIEW payslip.
 *    f. BLOCKED: No CALCULATED and no IN_REVIEW payslips, but HELD or REJECTED remain, batch not fully approved.
 *    g. IN_REVIEW: Latest batch has at least one CALCULATED payslip AND (has started review: IN_REVIEW/HELD/REJECTED > 0 or batch status is IN_REVIEW).
 *    h. CALCULATED: Latest batch status is CALCULATED (all payslips CALCULATED, no review decisions yet).
 * 3. If no batch exists:
 *    a. UPLOAD_REJECTED: Latest upload is REJECTED.
 *    b. VALIDATED: Latest upload exists and is VALIDATED/UPLOADED, but no batch created yet.
 */
export function derivePayRunState(input: DerivePayRunStateInput): PayRunState {
  const { latestUpload, latestBatch, counts } = input;

  if (!latestUpload && !latestBatch) {
    return 'NOT_STARTED';
  }

  if (latestBatch) {
    // 1. Terminal states
    if (latestBatch.status === PayslipBatchStatus.APPROVED) {
      return 'APPROVED';
    }
    if (latestBatch.status === PayslipBatchStatus.REJECTED) {
      return 'REJECTED';
    }

    // 2. Correction in progress (beats IN_REVIEW, READY_FOR_APPROVAL, PARTIALLY_APPROVED)
    if (
      latestBatch.version > 1 &&
      Boolean(latestBatch.earlierVersionHasApprovedPayslips)
    ) {
      return 'CORRECTION_IN_PROGRESS';
    }

    // 3. Partially approved (version 1)
    if (latestBatch.status === PayslipBatchStatus.PARTIALLY_APPROVED) {
      return 'PARTIALLY_APPROVED';
    }

    const calcCount = counts?.CALCULATED ?? 0;
    const inReviewCount = counts?.IN_REVIEW ?? 0;
    const heldCount = counts?.HELD ?? 0;
    const rejectedCount = counts?.REJECTED ?? 0;

    // 4. Ready for approval: no CALCULATED and at least one IN_REVIEW
    if (calcCount === 0 && inReviewCount > 0) {
      return 'READY_FOR_APPROVAL';
    }

    // 5. Blocked: no CALCULATED, no IN_REVIEW, but HELD or REJECTED remain
    if (calcCount === 0 && inReviewCount === 0 && (heldCount > 0 || rejectedCount > 0)) {
      return 'BLOCKED';
    }

    // 6. In review: at least one CALCULATED payslip while in review, or review has started
    if (
      latestBatch.status === PayslipBatchStatus.IN_REVIEW ||
      inReviewCount > 0 ||
      heldCount > 0 ||
      rejectedCount > 0
    ) {
      return 'IN_REVIEW';
    }

    // 7. Calculated: latest batch is CALCULATED
    return 'CALCULATED';
  }

  // No batch exists
  if (latestUpload) {
    if (latestUpload.status === BillingRateUploadStatus.REJECTED) {
      return 'UPLOAD_REJECTED';
    }
    return 'VALIDATED';
  }

  return 'NOT_STARTED';
}
