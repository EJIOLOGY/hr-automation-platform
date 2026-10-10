export const PAYSLIP_AUDIT_ACTOR = 'HR_OFFICER';

export interface PayslipAuditMetadataInput {
  companyId?: string;
  periodId: string;
  batchId?: string;
  uploadId?: string;
  payslipId?: string;
  dispatchId?: string;
  [key: string]: unknown;
}

export function payslipAuditMetadata(input: PayslipAuditMetadataInput): Record<string, unknown> {
  const result: Record<string, unknown> = {
    periodId: input.periodId,
  };

  if (input.companyId !== undefined) result.companyId = input.companyId;

  if (input.batchId !== undefined) result.batchId = input.batchId;
  if (input.uploadId !== undefined) result.uploadId = input.uploadId;
  if (input.payslipId !== undefined) result.payslipId = input.payslipId;
  if (input.dispatchId !== undefined) result.dispatchId = input.dispatchId;

  for (const [key, val] of Object.entries(input)) {
    if (!['companyId', 'periodId', 'batchId', 'uploadId', 'payslipId', 'dispatchId'].includes(key)) {
      result[key] = val;
    }
  }

  return result;
}
