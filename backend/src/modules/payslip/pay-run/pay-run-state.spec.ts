import { BillingRateUploadStatus, PayslipBatchStatus } from '../../../generated/prisma/client';
import { derivePayRunState, DerivePayRunStateInput, PayslipCountsInput } from './pay-run-state';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const UPLOAD_VALIDATED = { id: 'u1', version: 1, status: BillingRateUploadStatus.VALIDATED };
const UPLOAD_REJECTED  = { id: 'u1', version: 1, status: BillingRateUploadStatus.REJECTED };

const BATCH_CALCULATED      = { id: 'b1', version: 1, status: PayslipBatchStatus.CALCULATED };
const BATCH_IN_REVIEW       = { id: 'b1', version: 1, status: PayslipBatchStatus.IN_REVIEW };
const BATCH_APPROVED        = { id: 'b1', version: 1, status: PayslipBatchStatus.APPROVED };
const BATCH_REJECTED        = { id: 'b1', version: 1, status: PayslipBatchStatus.REJECTED };
const BATCH_PARTIAL         = { id: 'b1', version: 1, status: PayslipBatchStatus.PARTIALLY_APPROVED };
const BATCH_V2_IN_REVIEW    = { id: 'b2', version: 2, status: PayslipBatchStatus.IN_REVIEW, earlierVersionHasApprovedPayslips: true };
const BATCH_V2_NO_APPROVED  = { id: 'b2', version: 2, status: PayslipBatchStatus.IN_REVIEW, earlierVersionHasApprovedPayslips: false };

function counts(overrides: Partial<PayslipCountsInput> = {}): PayslipCountsInput {
  return {
    total: 10,
    CALCULATED: 10,
    IN_REVIEW: 0,
    HELD: 0,
    REJECTED: 0,
    APPROVED: 0,
    ...overrides,
  };
}

function input(overrides: Partial<DerivePayRunStateInput> = {}): DerivePayRunStateInput {
  return { latestUpload: null, latestBatch: null, counts: null, ...overrides };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('derivePayRunState', () => {
  // ── NOT_STARTED ────────────────────────────────────────────────────────────

  it('returns NOT_STARTED when no upload and no batch', () => {
    expect(derivePayRunState(input())).toBe('NOT_STARTED');
  });

  // ── Upload-only states ─────────────────────────────────────────────────────

  it('returns VALIDATED when upload exists but no batch yet', () => {
    expect(derivePayRunState(input({ latestUpload: UPLOAD_VALIDATED }))).toBe('VALIDATED');
  });

  it('returns UPLOAD_REJECTED when upload is rejected and no batch', () => {
    expect(derivePayRunState(input({ latestUpload: UPLOAD_REJECTED }))).toBe('UPLOAD_REJECTED');
  });

  // ── Terminal batch states ─────────────────────────────────────────────────

  it('returns APPROVED when latest batch is APPROVED', () => {
    expect(derivePayRunState(input({ latestBatch: BATCH_APPROVED, latestUpload: UPLOAD_VALIDATED, counts: counts({ APPROVED: 10, CALCULATED: 0 }) }))).toBe('APPROVED');
  });

  it('returns REJECTED when latest batch is REJECTED', () => {
    expect(derivePayRunState(input({ latestBatch: BATCH_REJECTED, latestUpload: UPLOAD_VALIDATED, counts: counts({ REJECTED: 10, CALCULATED: 0 }) }))).toBe('REJECTED');
  });

  // ── CALCULATED ────────────────────────────────────────────────────────────

  it('returns CALCULATED when batch is CALCULATED and all payslips are CALCULATED', () => {
    expect(derivePayRunState(input({ latestBatch: BATCH_CALCULATED, latestUpload: UPLOAD_VALIDATED, counts: counts() }))).toBe('CALCULATED');
  });

  // ── IN_REVIEW ─────────────────────────────────────────────────────────────

  it('returns IN_REVIEW when batch status is IN_REVIEW with mix of statuses', () => {
    expect(
      derivePayRunState(input({
        latestBatch: BATCH_IN_REVIEW,
        counts: counts({ CALCULATED: 5, IN_REVIEW: 3, HELD: 1, REJECTED: 1 }),
      })),
    ).toBe('IN_REVIEW');
  });

  it('returns IN_REVIEW when batch is CALCULATED but some review decisions are recorded', () => {
    expect(
      derivePayRunState(input({
        latestBatch: BATCH_CALCULATED,
        counts: counts({ CALCULATED: 5, IN_REVIEW: 3, HELD: 2 }),
      })),
    ).toBe('IN_REVIEW');
  });

  // ── READY_FOR_APPROVAL ────────────────────────────────────────────────────

  it('returns READY_FOR_APPROVAL when no CALCULATED left, some IN_REVIEW', () => {
    expect(
      derivePayRunState(input({
        latestBatch: BATCH_IN_REVIEW,
        counts: counts({ CALCULATED: 0, IN_REVIEW: 10 }),
      })),
    ).toBe('READY_FOR_APPROVAL');
  });

  // ── BLOCKED ───────────────────────────────────────────────────────────────

  it('returns BLOCKED when no CALCULATED and no IN_REVIEW but HELD remain', () => {
    expect(
      derivePayRunState(input({
        latestBatch: BATCH_IN_REVIEW,
        counts: counts({ CALCULATED: 0, IN_REVIEW: 0, HELD: 3, REJECTED: 7 }),
      })),
    ).toBe('BLOCKED');
  });

  it('returns BLOCKED when no CALCULATED and no IN_REVIEW but REJECTED remain', () => {
    expect(
      derivePayRunState(input({
        latestBatch: BATCH_IN_REVIEW,
        counts: counts({ CALCULATED: 0, IN_REVIEW: 0, REJECTED: 10 }),
      })),
    ).toBe('BLOCKED');
  });

  // ── PARTIALLY_APPROVED ────────────────────────────────────────────────────

  it('returns PARTIALLY_APPROVED when batch status is PARTIALLY_APPROVED (version 1)', () => {
    expect(
      derivePayRunState(input({
        latestBatch: BATCH_PARTIAL,
        counts: counts({ CALCULATED: 5, APPROVED: 5 }),
      })),
    ).toBe('PARTIALLY_APPROVED');
  });

  // ── CORRECTION_IN_PROGRESS ────────────────────────────────────────────────

  it('returns CORRECTION_IN_PROGRESS for v2 batch when earlier version has approved payslips', () => {
    expect(
      derivePayRunState(input({
        latestBatch: BATCH_V2_IN_REVIEW,
        counts: counts({ IN_REVIEW: 5 }),
      })),
    ).toBe('CORRECTION_IN_PROGRESS');
  });

  it('returns IN_REVIEW for v2 batch when NO earlier version has approved payslips', () => {
    expect(
      derivePayRunState(input({
        latestBatch: BATCH_V2_NO_APPROVED,
        counts: counts({ CALCULATED: 0, IN_REVIEW: 10 }),
      })),
    ).toBe('READY_FOR_APPROVAL'); // no CALCULATED left, IN_REVIEW > 0
  });

  // ── CORRECTION_IN_PROGRESS beats READY_FOR_APPROVAL ─────────────────────

  it('CORRECTION_IN_PROGRESS takes precedence over READY_FOR_APPROVAL', () => {
    expect(
      derivePayRunState(input({
        latestBatch: BATCH_V2_IN_REVIEW,
        counts: counts({ CALCULATED: 0, IN_REVIEW: 10 }),
      })),
    ).toBe('CORRECTION_IN_PROGRESS');
  });
});
