export interface MemoryPolicy {
  allowPersistence: boolean;
  allowedFields: string[];
  /**
   * Field names that must never be stored, including the plausible spellings of each.
   *
   * A bare list of canonical names is not a control: a filter matching only `creditCard`
   * is bypassed by sending `cardNumber`, and matching only `ssn` is bypassed by
   * `socialSecurityNumber`. The aliases are therefore part of the policy, enumerated
   * explicitly so the blocklist is auditable rather than inferred.
   */
  sensitiveFields: string[];
  maxSessionFacts: number;
  /**
   * Maximum characters in a single fact's content.
   *
   * `maxSessionFacts` alone bounds how many facts exist, not how large each one is. Without
   * this, one caller-supplied fact of arbitrary length lands directly in the system context
   * on every subsequent turn, which inflates token cost on every request and can push the
   * prompt past the model's usable context.
   */
  maxFactChars: number;
  /**
   * Maximum characters across all facts in one session.
   *
   * A per-fact cap still permits 25 facts that each approach the limit, so the total needs
   * its own ceiling. Oldest facts are evicted first once the aggregate is exceeded.
   */
  maxTotalMemoryChars: number;
  sessionStorageNamespace: (sessionId: string, personaId: string) => string;
}

export const DEFAULT_MEMORY_POLICY: MemoryPolicy = {
  allowPersistence: false, // Strict privacy: Ephemeral per-session isolation by default
  allowedFields: ['name', 'email', 'phone', 'preferredTimeOfDay', 'preferredStaff', 'notes'],
  sensitiveFields: [
    // Payment card: every spelling a caller or a future integration might plausibly send.
    'creditCard', 'creditcard', 'cardNumber', 'cardNo', 'cardHolder', 'cvv', 'cvc', 'pan', 'iban',
    // Government identifiers.
    'ssn', 'socialSecurityNumber', 'socialSecurity', 'passportNumber', 'taxId', 'nationalInsuranceNumber',
    // Credentials.
    'password', 'passwd', 'passphrase', 'secret', 'apiKey', 'accessToken', 'privateKey', 'authToken',
    // Medical and financial detail that should never be echoed into a prompt.
    'dateOfBirth', 'dob', 'medicalRecord', 'bankAccount', 'routingNumber', 'sortCode',
  ],
  maxSessionFacts: 25,
  // A single legitimate fact is a preference or an appointment detail, comfortably under a
  // few hundred characters. 500 leaves generous headroom while keeping one input from
  // dominating the prompt.
  maxFactChars: 500,
  // 25 facts at the per-fact cap would reach 12.5k characters, which is a large slice of a
  // live model's context for content that is mostly superseded. 4k holds the useful working
  // set for a booking conversation.
  maxTotalMemoryChars: 4_000,
  sessionStorageNamespace: (sessionId: string, personaId: string) =>
    `aura:session:${sessionId}:persona:${personaId}`,
};
