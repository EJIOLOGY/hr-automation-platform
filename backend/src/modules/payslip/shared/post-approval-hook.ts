export interface PayslipApprovalContext {
  batchId: string;
  payslipIds: string[];
}

export interface PayslipPostApprovalHook {
  onApproved(ctx: PayslipApprovalContext): Promise<void>;
}

export const PAYSLIP_POST_APPROVAL_HOOKS = Symbol('PAYSLIP_POST_APPROVAL_HOOKS');
