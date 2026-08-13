export class PhoneNumberNormalizer {
  static normalize(phone: string): string {
    const normalized = phone.trim().replace(/[\s\-()]/g, '');

    if (!normalized) {
      throw new Error('Phone number is required');
    }

    if (/^\+234\d{10}$/.test(normalized)) {
      return normalized;
    }

    if (/^0\d{10}$/.test(normalized)) {
      return `+234${normalized.slice(1)}`;
    }

    throw new Error('Invalid Nigerian mobile phone number');
  }
}
