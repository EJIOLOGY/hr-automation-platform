# Amazon SES Setup Guide — eu-west-1

**Domain:** `intertechsystemslimited.com`  
**Region:** `eu-west-1` (Ireland)  
**Configuration Set:** `payslip-delivery`

---

## 1. Verify Sending Domain & Custom MAIL FROM
1. Open the Amazon SES Console in `eu-west-1`.
2. Go to **Configuration** > **Identities** > **Create identity**.
3. Select **Domain**, enter `intertechsystemslimited.com`, and enable **Easy DKIM** (RSA 2048-bit).
4. Add the generated CNAME records to DNS.
5. In **Custom MAIL FROM domain**, configure `mail.intertechsystemslimited.com` with:
   - MX: `10 feedback-smtp.eu-west-1.amazonses.com`
   - TXT (SPF): `v=spf1 include:amazonses.com ~all`

---

## 2. Create Configuration Set & Event Publishing Destination
1. Go to **Configuration** > **Configuration Sets** > **Create set**.
2. Name: `payslip-delivery`.
3. Under **Event destinations**, add an Amazon SNS event destination:
   - Select event types: **Sends**, **Rejections**, **Deliveries**, **Delivery Delays**, **Hard Bounces**, **Soft Bounces**, **Complaints**, **Rendering Failures**.
   - Create or select an SNS topic: `arn:aws:sns:eu-west-1:<account-id>:payslip-ses-events`.

---

## 3. Minimum IAM Policy
Create an IAM User for the backend instance with the following minimal policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:GetAccount",
        "ses:GetEmailIdentity",
        "ses:GetSuppressedDestination"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## 4. Subscribe Public Webhook to SNS Topic
1. Go to Amazon SNS Console in `eu-west-1`.
2. Find topic `payslip-ses-events` > **Create subscription**.
3. Protocol: **HTTPS**.
4. Endpoint: `https://<public-backend-domain>/api/v1/webhooks/ses-events`.
5. The backend automatically confirms subscription via the incoming `SubscriptionConfirmation` message.

---

## 5. Request SES Production Access
Submit an SES production access request with the following template:

> We are requesting production access for transactional employee payslip delivery on `intertechsystemslimited.com` in `eu-west-1`.
> Recipients are verified employees receiving monthly salary statements with PDF attachments.
> All recipients have an established employment relationship.
> Bounces and complaints are tracked via configuration set SNS destinations and placed immediately on an active suppression list.
> Initial sending volume is approximately 600–2,000 emails per monthly pay run.

---

## 6. Environment Variables Table

| Variable | Default | Purpose |
|---|---|---|
| `AWS_REGION` | `eu-west-1` | AWS region for SES & SNS |
| `AWS_ACCESS_KEY_ID` | (unset) | IAM credentials |
| `AWS_SECRET_ACCESS_KEY` | (unset) | IAM credentials |
| `PAYSLIP_FROM_EMAIL` | (unset) | Verified sender address (e.g. `payslips@intertechsystemslimited.com`) |
| `SES_CONFIGURATION_SET` | `payslip-delivery` | Configuration set name for tags and event publishing |
| `SES_SNS_TOPIC_ARN` | (unset) | ARN of the SNS topic to validate incoming webhooks |
| `SES_SEND_RATE_PER_SECOND` | `1` | Token bucket sending rate cap |
| `PAYSLIP_WORKER_ENABLED` | `true` | Enable/disable delivery polling worker |
| `PAYSLIP_WORKER_IDLE_MS` | `5000` | Idle sleep interval when no deliveries are claimable |
| `PAYSLIP_PDF_PIN_DAYS` | `3` | Minimum retention days pinned upon dispatch release |
| `PAYSLIP_RETENTION_DAYS` | `20` | Stored PDF and delivery record retention window |
