import { maskEmail, normalizeEmail } from './email-utils';

describe('email-utils', () => {
  describe('normalizeEmail', () => {
    it('trims whitespace and converts to lower case', () => {
      expect(normalizeEmail('  John.Doe@Example.COM  ')).toBe('john.doe@example.com');
    });
  });

  describe('maskEmail', () => {
    it('masks middle characters for standard emails', () => {
      expect(maskEmail('john.doe@example.com')).toBe('j******e@example.com');
    });

    it('masks short usernames appropriately', () => {
      expect(maskEmail('ab@example.com')).toBe('**@example.com');
      expect(maskEmail('a@example.com')).toBe('*@example.com');
    });

    it('handles malformed string without @', () => {
      expect(maskEmail('invalid')).toBe('***');
    });
  });
});
