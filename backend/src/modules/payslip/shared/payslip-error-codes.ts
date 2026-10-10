import { HttpException, HttpStatus } from '@nestjs/common';

export type PayslipErrorCode =
  | 'ADMIN_REQUIRED'
  | 'COMPANY_EXISTS'
  | 'PERIOD_EXISTS'
  | 'PERIOD_OVERLAP'
  | 'OFFICER_ALREADY_HAS_CLAIM'
  | 'BATCH_NOT_REVIEWABLE'
  | 'BATCH_NOT_APPROVABLE'
  | 'NEWER_VERSION_EXISTS'
  | 'VERSION_MISMATCH'
  | 'PAYSLIP_APPROVED_IMMUTABLE'
  | 'NOTE_REQUIRED'
  | 'NOTHING_TO_APPROVE'
  | 'UNRESOLVED_PAYSLIPS'
  | 'UNRESOLVED_COUNT_CHANGED'
  | 'FINISH_APPROVAL_FIRST'
  | 'CORRECTION_IN_PROGRESS'
  | 'CARRY_FORWARD_INTEGRITY'
  | 'FILE_REQUIRED'
  | 'WORKBOOK_META_INVALID'
  | 'WORKBOOK_WRONG_BATCH'
  | 'WORKBOOK_UNKNOWN_EXPORT'
  | 'WORKBOOK_STALE'
  | 'WORKBOOK_PARSE_ERRORS'
  | 'BATCH_CHANGED_SINCE_PREVIEW'
  | 'PREVIEW_EXPIRED'
  | 'TOO_MANY_ROWS'
  | 'TRANSACTION_TIMEOUT'
  | 'VALIDATION_FAILED'
  | 'PDF_NOT_READY'
  | 'SES_NOT_CONFIGURED'
  | 'SES_SANDBOX'
  | 'SES_AUTH_FAILED'
  | 'DISPATCH_NOT_APPROVABLE'
  | 'DISPATCH_PAUSED'
  | 'RECIPIENT_COUNT_CHANGED'
  | 'OLDER_VERSION_DELIVERY_ACTIVE'
  | 'DELIVERY_NOT_RETRYABLE'
  | 'EMAIL_UNCHANGED_SINCE_BOUNCE'
  | 'SUPPRESSED_ADDRESS'
  | 'ALREADY_DELIVERED'
  | 'SUPPRESSION_NOT_RESOLVABLE'
  | 'INVALID_SNS_SIGNATURE'
  | 'TEST_MODE_LIMIT_EXCEEDED'
  | 'INVALID_EMAIL';

export interface PayslipErrorPayload {
  statusCode: number;
  code: PayslipErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export function payslipError(
  status: HttpStatus | number,
  code: PayslipErrorCode,
  message: string,
  details?: Record<string, unknown>,
): HttpException {
  const body: PayslipErrorPayload = {
    statusCode: status,
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  };
  return new HttpException(body, status);
}
