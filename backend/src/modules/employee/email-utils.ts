import * as dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

/** Very permissive RFC 5322-inspired regex: local@domain.tld */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns true if the string looks like a valid email address
 * AND the domain has at least one MX record.
 *
 * DNS resolution failures (ENOTFOUND, ENODATA, ESERVFAIL, etc.) are treated as
 * invalid so that transient DNS issues still reject clearly-bogus domains rather
 * than silently accepting them.
 */
export async function isEmailValid(email: string): Promise<boolean> {
  if (!email || !EMAIL_REGEX.test(email)) {
    return false;
  }

  const domain = email.split('@')[1].toLowerCase();

  try {
    const records = await resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

/**
 * Masks an email address for display purposes.
 * Example: "john.doe@example.com" → "j*****e@example.com"
 * Short local-parts (≤ 2 chars) are fully masked: "jo@x.com" → "**@x.com"
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex < 0) return '***';

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex); // includes the '@'

  if (local.length <= 2) {
    return '*'.repeat(local.length) + domain;
  }

  return local[0] + '*'.repeat(local.length - 2) + local[local.length - 1] + domain;
}

/**
 * Normalise an email address: trim whitespace and lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
