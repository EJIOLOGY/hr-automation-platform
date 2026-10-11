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

---

## Standard Error Codes

- `PDF_NOT_READY` (HTTP 409): Dispatched payslips must all have stored PDFs in `READY` status. Returns breakdown of ready/pending/missing counts and first 100 non-ready staff IDs.
- `SES_SANDBOX_RESTRICTED` (HTTP 409): In SES sandbox mode, only verified email identities can be released.
- `ADMIN_REQUIRED` (HTTP 403): Operation restricted to Admin role.
- `TRANSACTION_TIMEOUT` (HTTP 503): Prisma P2028 interactive transaction timeout. Safe to retry.
- `SUPPRESSED_ADDRESS` (HTTP 400): Recipient email address is currently active in the suppression table.
