import { createHash } from 'node:crypto';
import { formatCurrencyString } from './currency';

export interface PayslipLineHashInput {
  name: string;
  kind: string;
  amount: number | string;
  taxClass: string;
  sortOrder: number;
}

export interface PayslipContentHashInput {
  staffId: string;
  calculationInputs: Record<string, unknown> | null | undefined;
  calculationOutputs: Record<string, unknown> | null | undefined;
  lines: PayslipLineHashInput[];
}

function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalStringify(item)).join(',') + ']';
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((key) => {
    return `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`;
  });
  return '{' + pairs.join(',') + '}';
}

export function computePayslipContentHash(input: PayslipContentHashInput): string {
  const normalizedLines = (input.lines || [])
    .map((l) => ({
      name: l.name,
      kind: l.kind,
      amount: formatCurrencyString(l.amount),
      taxClass: l.taxClass,
      sortOrder: Number(l.sortOrder ?? 0),
    }))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    });

  const canonicalPayload = {
    calculationInputs: input.calculationInputs ?? {},
    calculationOutputs: input.calculationOutputs ?? {},
    lines: normalizedLines,
    staffId: input.staffId,
  };

  const jsonString = canonicalStringify(canonicalPayload);
  return createHash('sha256').update(jsonString).digest('hex');
}
