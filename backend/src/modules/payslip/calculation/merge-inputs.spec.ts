import { mergeInputOverrides } from './merge-inputs';
import type { CalculationInputs } from './calculation.types';

const base = {
  baseFee: 1000,
  daysWorked: 10,
  totalDays: 20,
  allowances: { A: 1, B: 2 },
  arrears: { A: 3 },
} as unknown as CalculationInputs;

describe('mergeInputOverrides', () => {
  it('ignores undefined scalars and keeps stored values', () => {
    const r = mergeInputOverrides(base, { baseFee: undefined, daysWorked: 12 });
    expect(r).toMatchObject({ baseFee: 1000, daysWorked: 12, totalDays: 20 });
  });

  it('merges allowances and arrears key by key', () => {
    const r = mergeInputOverrides(base, { allowances: { B: 9, C: 4 }, arrears: { B: 1 } });
    expect(r.allowances).toEqual({ A: 1, B: 9, C: 4 });
    expect(r.arrears).toEqual({ A: 3, B: 1 });
  });

  it('does not mutate the stored inputs', () => {
    mergeInputOverrides(base, { allowances: { A: 99 } });
    expect(base.allowances).toEqual({ A: 1, B: 2 });
  });
});
