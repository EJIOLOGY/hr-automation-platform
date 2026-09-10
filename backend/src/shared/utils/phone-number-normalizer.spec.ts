import { PhoneNumberNormalizer } from './phone-number-normalizer';

describe('PhoneNumberNormalizer', () => {
  it('returns an already-normalized +234 number unchanged', () => {
    expect(PhoneNumberNormalizer.normalize('+2348012345678')).toBe(
      '+2348012345678',
    );
  });

  it('converts a local 0-prefixed number to +234 format', () => {
    expect(PhoneNumberNormalizer.normalize('08012345678')).toBe(
      '+2348012345678',
    );
  });

  it('converts a bare MSISDN (as sent by WhatsApp webhooks) to +234 format', () => {
    expect(PhoneNumberNormalizer.normalize('2348012345678')).toBe(
      '+2348012345678',
    );
  });

  it('strips whitespace, dashes, and parentheses before normalizing', () => {
    expect(PhoneNumberNormalizer.normalize(' 234 801-234 5678 ')).toBe(
      '+2348012345678',
    );
  });

  it('throws on an empty phone number', () => {
    expect(() => PhoneNumberNormalizer.normalize('')).toThrow(
      'Phone number is required',
    );
  });

  it('throws on a non-Nigerian or malformed number', () => {
    expect(() => PhoneNumberNormalizer.normalize('+14155552671')).toThrow(
      'Invalid Nigerian mobile phone number',
    );
  });
});
