# Payslip Delivery Go-Live Checklist

## Pre-Flight Verification
- [ ] AWS IAM user credentials configured in host environment (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`).
- [ ] `PAYSLIP_FROM_EMAIL` set to verified domain address (e.g. `payslips@intertechsystemslimited.com`).
- [ ] Configuration set `payslip-delivery` created in AWS SES console with SNS destination.
- [ ] SNS Topic ARN configured in `SES_SNS_TOPIC_ARN`.
- [ ] Public webhook `POST /api/v1/webhooks/ses-events` accessible over HTTPS and subscription confirmed.

## Testing in Sandbox Mode
- [ ] Test delivery to verified identity succeeds (`outcome = ACCEPTED`, transitions to `SUBMITTED`).
- [ ] Test simulator bounce: send test email to `bounce@simulator.amazonses.com` -> SNS event triggers `BOUNCED_HARD` and creates `EmailSuppression` record.
- [ ] Test simulator complaint: send test email to `complaint@simulator.amazonses.com` -> SNS event triggers `COMPLAINED` and creates `EmailSuppression` record.
- [ ] Test simulator success: send test email to `success@simulator.amazonses.com` -> SNS event triggers `DELIVERED`.
- [ ] Test unverified address in sandbox: verify dispatch release returns 409 `SES_SANDBOX_RESTRICTED`.

## Production Transition
- [ ] Request SES production access approved by AWS.
- [ ] Check `GET /api/v1/payslip/ses-status` indicates `productionAccessEnabled: true`.
- [ ] Adjust `SES_SEND_RATE_PER_SECOND` to granted sending quota.
- [ ] Confirm retention sweep cron is scheduled and running.
