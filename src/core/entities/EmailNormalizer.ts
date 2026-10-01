export interface NormalizedEmailResult {
  email: string;
  isValid: boolean;
  confidence: number;
  needsSpellingConfirmation: boolean;
  suggestedPrompt?: string;
}

export class EmailNormalizer {
  /**
   * Normalizes spoken email representations (e.g. "john dot smith at gmail dot com")
   */
  public static normalize(spokenText: string): NormalizedEmailResult | null {
    let clean = spokenText.trim().toLowerCase();

    // Direct email regex match
    const directMatch = clean.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (directMatch) {
      const email = directMatch[1];
      const isValid = this.validateSyntax(email);
      return {
        email,
        isValid,
        confidence: isValid ? 0.98 : 0.6,
        needsSpellingConfirmation: false,
      };
    }

    // Replace spoken phrases
    let converted = clean
      .replace(/\s+at\s+/g, '@')
      .replace(/\s+dot\s+/g, '.')
      .replace(/\s+underscore\s+/g, '_')
      .replace(/\s+dash\s+/g, '-')
      .replace(/\s+hyphen\s+/g, '-')
      .replace(/\s+/g, '');

    const match = converted.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (match) {
      const email = match[1];
      const isValid = this.validateSyntax(email);
      const isComplex = email.split('@')[0].length > 15 || email.includes('_') || email.includes('-');

      return {
        email,
        isValid,
        confidence: isValid ? (isComplex ? 0.85 : 0.95) : 0.5,
        needsSpellingConfirmation: isComplex,
        suggestedPrompt: isComplex
          ? `Could you confirm the spelling before the @ for ${email}?`
          : `I have ${email}. Is that correct?`,
      };
    }

    return null;
  }

  public static validateSyntax(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }
}
