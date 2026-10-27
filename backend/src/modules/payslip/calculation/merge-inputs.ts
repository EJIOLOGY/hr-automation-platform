import type { CalculationInputs } from './calculation.types';

export type InputOverrides = Partial<
  Pick<
    CalculationInputs,
    'baseFee' | 'daysWorked' | 'daysAbsent' | 'totalDays' | 'otherDeduction'
  >
> & {
  allowances?: Record<string, number>;
  arrears?: Record<string, number>;
};

/**
 * Applies corrections to a payslip's stored inputs. Used by every correction path so they behave identically:
 * - `undefined` values never overwrite a stored value (a DTO instance carries undefined for omitted fields);
 * - `allowances` and `arrears` are merged key by key, so correcting one allowance keeps the others.
 */
export function mergeInputOverrides(
  current: CalculationInputs,
  overrides: InputOverrides,
): CalculationInputs {
  const { allowances, arrears, ...scalars } = overrides;
  const definedScalars = Object.fromEntries(
    Object.entries(scalars).filter(([, value]) => value !== undefined),
  );
  return {
    ...current,
    ...definedScalars,
    allowances: { ...(current.allowances ?? {}), ...(allowances ?? {}) },
    arrears: { ...(current.arrears ?? {}), ...(arrears ?? {}) },
  };
}
