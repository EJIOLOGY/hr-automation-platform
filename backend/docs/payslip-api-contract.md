# Payslip API Contract & Error Codes

## Core Endpoints & Roles

| Method & Route | Roles | Description | Error Codes |
|---|---|---|---|
| `POST /api/v1/payslip/batches/:id/email-dispatch` | Admin, Officer | Create dispatch draft | `PDF_NOT_READY`, `NOTHING_TO_APPROVE` |
| `POST /api/v1/payslip/batches/:id/email-dispatch/:dId/release` | Admin | Release dispatch for sending | `PDF_NOT_READY`, `SES_SANDBOX_RESTRICTED`, `DISPATCH_NOT_APPROVABLE` |
| `POST /api/v1/payslip/batches/:id/email-dispatch/:dId/pause` | Admin, Officer | Pause in-flight dispatch | 400 |
| `POST /api/v1/payslip/batches/:id/email-dispatch/:dId/resume` | Admin | Resume paused dispatch | 400 |
| `POST /api/v1/payslip/batches/:id/email-dispatch/:dId/cancel` | Admin | Cancel pending deliveries | 400 |
| `GET /api/v1/payslip/batches/:id/email-dispatch/:dId` | Admin, Officer | Dispatch breakdown & status | 404 |
| `POST /api/v1/payslip/batches/:id/email-dispatch/:dId/retry-failed` | Admin | Reset FAILED deliveries to PENDING | 404 |
| `GET /api/v1/payslip/batches/:id/distribution` | Admin, Officer | Batch delivery overview | 404 |
| `POST /api/v1/webhooks/ses-events` | Public | SNS webhook receiver | 403 (invalid signature/host) |
| `GET /api/v1/payslip/email-suppressions` | Admin, Officer | Paginated suppression list | - |
| `POST /api/v1/payslip/email-suppressions/:id/acknowledge` | Admin, Officer | Acknowledge suppression | 404 |
| `POST /api/v1/payslip/email-suppressions/:id/resolve` | Admin | Resolve suppression with note | 400, 404 |
| `POST /api/v1/payslip/deliveries/:id/resolve-unknown` | Admin | Reconcile uncertain send | 400, 404 |
| `GET /api/v1/payslip/ses-status` | Admin, Officer | Live/cached SES quota & identity status | - |
| `POST /api/v1/payslip/admin/reconcile` | Admin | Apply stored SES events now; count stale uncertain sends | - |
| `POST /api/v1/payslip/admin/retention-sweep` | Admin | Run the retention sweep now (also runs daily) | - |
| `GET /api/v1/payslip/settings` | Admin, Officer | Review settings (variance threshold %) | - |
| `PUT /api/v1/payslip/settings` | Admin | Update variance threshold (whole number 1-100); audited | 400 |
| `GET /api/v1/payslip/batches/:id/activity?limit&cursor` | Admin, Officer | Audit trail for a batch and its dispatches (no pay figures) | 404 |
| `GET /api/v1/payslip/payslips/:id` | Admin, Officer | One payslip with review, PDF and email delivery state | 404 |
| `GET /api/v1/payslip/companies/:cId/periods/:pId/pay-run-state` | Admin, Officer (claim on this company + period) | Pay-run lifecycle state; the period must belong to the company | 403, 404 |
| `GET /api/v1/payslip/batches/:id/review-workbook` | Admin, Officer (claim) | Download the review workbook (18 columns + `LineItems` + hidden `__meta`) | `CONFIG_ERROR` (password env var unset) |
| `POST /api/v1/payslip/batches/:id/review-workbook/preview` | Admin, Officer (claim) | Upload an edited workbook (`file`, .xlsx, max 10 MB). Validates, recalculates in memory and returns the diff. A preview (30 min) is created only when `applicable: true` | `FILE_REQUIRED`, `INVALID_WORKBOOK_FILE`, `WORKBOOK_META_INVALID`, `WORKBOOK_WRONG_BATCH`, `WORKBOOK_UNKNOWN_EXPORT`, `WORKBOOK_STALE`, `NEWER_VERSION_EXISTS`, `BATCH_NOT_REVIEWABLE`, `WORKBOOK_PARSE_ERRORS` |
| `POST /api/v1/payslip/batches/:id/review-workbook/apply` | Admin, Officer (claim) | Apply a preview in one transaction: recalculate edited payslips, persist inputs/outputs/line items, then record decisions. Idempotent | `PREVIEW_EXPIRED` (410), `WORKBOOK_STALE`, `PAYSLIP_APPROVED_IMMUTABLE` |

---

## Standard Error Codes

- `PDF_NOT_READY` (HTTP 409): Dispatched payslips must all have stored PDFs in `READY` status. Returns breakdown of ready/pending/missing counts and first 100 non-ready staff IDs.
- `SES_SANDBOX_RESTRICTED` (HTTP 409): In SES sandbox mode, only verified email identities can be released.
- `ADMIN_REQUIRED` (HTTP 403): Operation restricted to Admin role.
- `TRANSACTION_TIMEOUT` (HTTP 503): Prisma P2028 interactive transaction timeout. Safe to retry.
- `SUPPRESSED_ADDRESS` (HTTP 400): Recipient email address is currently active in the suppression table.

- `FILE_REQUIRED` (HTTP 400): No non-empty `file` was sent. Checked after the claim, so a non-claimant learns nothing about the file.
- `INVALID_WORKBOOK_FILE` (HTTP 400 / 413): Not a real .xlsx (must be a ZIP) or larger than 10 MB. Multer also rejects oversize uploads with 413 before the handler runs.
- `WORKBOOK_META_INVALID` (HTTP 400): The hidden `__meta` sheet is missing or unreadable (workbooks exported before this version must be re-exported).
- `WORKBOOK_WRONG_BATCH` (HTTP 409): The workbook was exported from a different batch.
- `WORKBOOK_UNKNOWN_EXPORT` (HTTP 409): The export fingerprint is not one this system issued.
- `WORKBOOK_STALE` (HTTP 409): The batch changed (any payslip status or update) since the export, or between preview and apply. Export again.
- `NEWER_VERSION_EXISTS` (HTTP 409): Only the latest batch version for a company and period can be reviewed.
- `WORKBOOK_PARSE_ERRORS` (HTTP 400): Required columns are missing or the sheet exceeds 1,500 payslip rows.
- `PREVIEW_EXPIRED` (HTTP 410): The preview is older than 30 minutes or was superseded.
- `PAYSLIP_APPROVED_IMMUTABLE` (HTTP 409): An approved payslip cannot be edited through the workbook.

### Preview response

`{ previewId | null, applicable, summary, rows[], errors[] }`. When any row has an error, `applicable` is `false` and `previewId` is `null`; nothing can be applied. Row errors carry a code such as `INVALID_NUMBER`, `NEGATIVE_NUMBER`, `TOTAL_DAYS_NOT_POSITIVE`, `DAYS_WORKED_EXCEEDS_TOTAL`, `UNKNOWN_DECISION`, `NOTE_REQUIRED`, `FINISH_APPROVAL_FIRST`, `UNSUPPORTED_ALLOWANCE`, `DUPLICATE_LINE`.

### Apply response

`{ applied, previewId, batchId, batchStatus, correctionBatchId: null, correctionVersion: null, counts: { recalculated, decisions, correctionPayslips }, statusCounts }`. Edited payslips return to `CALCULATED` and must be reviewed again.

### Configuration

`PAYSLIP_REVIEW_WORKBOOK_PROTECTION_PASSWORD` is required for export (no default).
