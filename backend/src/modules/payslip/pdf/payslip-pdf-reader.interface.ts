export type PayslipPdfReadyResult = {
  status: 'READY';
  bytes: Buffer;
  sha256: string;
  sizeBytes: number;
};

export type PayslipPdfNotReadyResult = {
  status: 'PENDING' | 'GENERATING' | 'FAILED' | 'EXPIRED';
};

export type PayslipPdfReaderResult = PayslipPdfReadyResult | PayslipPdfNotReadyResult;

export abstract class PayslipPdfReader {
  abstract getReady(payslipId: string): Promise<PayslipPdfReaderResult>;
}

export abstract class PayslipPdfGenerationRequester {
  abstract request(payslipIds: string[]): Promise<void>;
}

export abstract class PayslipPdfRetentionPin {
  abstract pin(payslipIds: string[], minDays?: number): Promise<void>;
}
