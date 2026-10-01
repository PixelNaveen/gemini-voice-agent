export class PrivacySanitizer {
  private static readonly SECRET_KEYS = [
    'api_key',
    'apikey',
    'secret',
    'password',
    'token',
    'authorization',
    'auth_header',
    'bearer',
    'privatekey',
  ];

  public static redactEmail(email?: string): string {
    if (!email || !email.includes('@')) return email || '';
    const [user, domain] = email.split('@');
    const maskedUser = user.length <= 2 ? `${user[0]}*` : `${user[0]}***${user[user.length - 1]}`;
    return `${maskedUser}@${domain}`;
  }

  public static redactPhone(phone?: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 4) return '***';
    return `***-***-${digits.slice(-4)}`;
  }

  public static sanitizePayload(payload: any, depth = 0): any {
    if (depth > 4 || !payload) return payload;

    if (typeof payload === 'string') {
      // Check for bearer tokens or JWTs
      if (payload.startsWith('Bearer ') || payload.split('.').length === 3) {
        return '[REDACTED_AUTH_TOKEN]';
      }
      return payload;
    }

    if (Array.isArray(payload)) {
      return payload.map((item) => this.sanitizePayload(item, depth + 1));
    }

    if (typeof payload === 'object') {
      const sanitized: Record<string, any> = {};
      for (const [key, val] of Object.entries(payload)) {
        const lowerKey = key.toLowerCase();
        if (this.SECRET_KEYS.some((secretKey) => lowerKey.includes(secretKey))) {
          sanitized[key] = '[REDACTED_SECRET]';
        } else if (lowerKey.includes('email') && typeof val === 'string') {
          sanitized[key] = this.redactEmail(val);
        } else if (lowerKey.includes('phone') && typeof val === 'string') {
          sanitized[key] = this.redactPhone(val);
        } else {
          sanitized[key] = this.sanitizePayload(val, depth + 1);
        }
      }
      return sanitized;
    }

    return payload;
  }
}
