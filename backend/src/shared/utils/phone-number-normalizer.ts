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

    // WhatsApp Cloud API sends sender numbers as a bare MSISDN with no
    // '+' prefix (e.g. "2348012345678"), as does the Graph API's `wa_id`.
    if (/^234\d{10}$/.test(normalized)) {
      return `+${normalized}`;
    }

    // A valid Nigerian mobile number without its local leading zero
    // must begin with 7, 8, or 9 and contain exactly 10 digits.
    if (/^[789]\d{9}$/.test(normalized)) {
      return `+234${normalized}`;
    }

    throw new Error('Invalid Nigerian mobile phone number');
  }
}
