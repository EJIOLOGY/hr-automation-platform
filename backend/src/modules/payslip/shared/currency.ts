/**
 * Convert an amount in major currency units (e.g. Naira) to integer minor units (kobo)
 * after rounding to 2 decimal places.
 */
export function toMinorUnits(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0;
  const num = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100);
}

/**
 * Convert integer minor units (kobo) back to major units (Naira) formatted as string with 2 decimals.
 */
export function fromMinorUnitsToString(minorUnits: number): string {
  const major = minorUnits / 100;
  return major.toFixed(2);
}

/**
 * Convert integer minor units (kobo) back to number with 2 decimals.
 */
export function fromMinorUnitsToNumber(minorUnits: number): number {
  return Math.round(minorUnits) / 100;
}

/**
 * Sum an array of amounts safely via integer minor units, returning a string with 2 decimals.
 */
export function sumToCurrencyString(amounts: (number | string | null | undefined)[]): string {
  let totalKobo = 0;
  for (const a of amounts) {
    totalKobo += toMinorUnits(a);
  }
  return fromMinorUnitsToString(totalKobo);
}

/**
 * Format any number or string amount to a string with exactly 2 decimal places.
 */
export function formatCurrencyString(amount: number | string | null | undefined): string {
  return fromMinorUnitsToString(toMinorUnits(amount));
}
