import { DEFAULT_MEMORY_POLICY, MemoryPolicy } from './MemoryPolicy';
import { CustomerMemory, INITIAL_CUSTOMER_MEMORY, SessionFact, StructuredMemoryState } from './SessionMemory';

export class MemoryManager {
  private sessionId: string;
  private personaId: string;
  private policy: MemoryPolicy;
  private state: StructuredMemoryState;
  private listeners: ((state: StructuredMemoryState) => void)[] = [];
  /**
   * F-28: the ids of the facts the system seeded, which are instructions rather than data.
   *
   * The protection lives here rather than in the UI so it cannot be bypassed by any other
   * caller. A "reset memory" control, an unsubscribe-driven re-render, or a future screen that
   * offers per-fact deletion would all otherwise be able to remove a rule the agent is required
   * to operate under, and the rule would not come back on the next call.
   */
  private protectedFactIds: Set<string>;

  constructor(
    sessionId: string,
    personaId: string,
    policy: MemoryPolicy = DEFAULT_MEMORY_POLICY,
    initialFacts: SessionFact[] = []
  ) {
    this.sessionId = sessionId;
    this.personaId = personaId;
    this.policy = policy;
    this.state = {
      sessionId,
      personaId,
      sessionFacts: [...initialFacts],
      customerMemory: { ...INITIAL_CUSTOMER_MEMORY },
    };
    this.protectedFactIds = new Set(initialFacts.map((f) => f.id));
    this.loadFromStorage();
  }

  public getState(): StructuredMemoryState {
    return this.state;
  }

  public subscribe(listener: (state: StructuredMemoryState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    this.saveToStorage();
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[MemoryManager] Listener error:', err);
      }
    }
  }

  public addSessionFact(
    content: string,
    category: SessionFact['category'] = 'fact',
    source: SessionFact['source'] = 'USER'
  ): void {
    const trimmed = content.trim();
    if (!trimmed) return;

    // Reject rather than truncate. Silently cutting a fact mid-word would store something
    // that is not what the caller said, and the truncated version would then be treated as
    // authoritative in the prompt. Dropping it keeps the stored state honest.
    if (trimmed.length > this.policy.maxFactChars) {
      console.warn(
        `[MemoryManager] Dropped an over-long fact (${trimmed.length} chars > ${this.policy.maxFactChars}); ` +
          `oversized caller input must not reach the system context.`
      );
      return;
    }

    const isDup = this.state.sessionFacts.some(
      (f) => f.content.toLowerCase().trim() === trimmed.toLowerCase()
    );
    if (isDup) return;

    const newFact: SessionFact = {
      id: `fact_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category,
      content: trimmed,
      source,
      timestamp: Date.now(),
    };

    let facts = [newFact, ...this.state.sessionFacts];
    if (facts.length > this.policy.maxSessionFacts) {
      facts = facts.slice(0, this.policy.maxSessionFacts);
    }
    // The count cap alone still permits every fact to sit near the per-fact ceiling, so the
    // aggregate is bounded separately. Facts are ordered newest first, so trimming from the
    // tail drops the least relevant material first and keeps the newest context.
    const totalChars = facts.reduce((sum, f) => sum + f.content.length, 0);
    if (totalChars > this.policy.maxTotalMemoryChars) {
      let running = 0;
      const kept: SessionFact[] = [];
      for (const fact of facts) {
        const next = running + fact.content.length;
        if (next > this.policy.maxTotalMemoryChars) break;
        kept.push(fact);
        running = next;
      }
      facts = kept;
    }

    this.state.sessionFacts = facts;
    this.notify();
  }

  /**
   * True when a field name is on the policy's sensitive list.
   *
   * Matching is by normalized token set, not raw string equality, so a caller cannot pick a
   * spelling that slips past the filter. `credit_card`, `CREDIT-CARD`, and `cardNumber` all
   * resolve to a token set the policy recognizes.
   *
   * A short alias is never matched as a substring, because a three-letter fragment like
   * `pan` occurs inside ordinary words and would reject legitimate fields. Substring
   * matching is only applied to aliases long enough to be unambiguous.
   */
  public isSensitiveField(field: string): boolean {
    const tokens = MemoryManager.tokenize(field);
    if (tokens.length === 0) return false;
    const squashed = tokens.join('');

    for (const entry of this.policy.sensitiveFields) {
      const aliasTokens = MemoryManager.tokenize(entry);
      if (aliasTokens.length === 0) continue;
      const alias = aliasTokens.join('');

      if (squashed === alias) return true;
      // All of the alias's tokens are present, so `card` inside `cardNumber` still matches
      // an alias written as `card`, and `userPassword` matches `password`.
      if (aliasTokens.every((t) => tokens.includes(t))) return true;
      // Long aliases are safe to match inside a longer squashed name, which catches compounds
      // whose tokenization does not align, such as `cardNumber` against `creditCard`.
      if (alias.length >= 5 && squashed.includes(alias)) return true;
    }
    return false;
  }

  /** Splits an identifier into lowercase word tokens across camelCase and separators. */
  private static tokenize(value: string): string[] {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[^A-Za-z0-9]+/)
      .filter((t) => t.length > 0)
      .map((t) => t.toLowerCase());
  }

  /** True when the id is a seeded system rule, which is not deletable. */
  public isProtectedFact(id: string): boolean {
    return this.protectedFactIds.has(id);
  }

  /**
   * Re-asserts the seeded rules, restoring any that were removed.
   *
   * A reset must forget what the caller said and keep what the system asserts. `clear()` wipes
   * the one list that holds both, so without this the agent is left with no protocol rules for
   * the rest of the call - which is a downgrade, not a reset.
   */
  public restoreSeededFacts(initialFacts: SessionFact[]): void {
    for (const fact of initialFacts) {
      if (!this.state.sessionFacts.some((f) => f.id === fact.id)) {
        this.state.sessionFacts.push({ ...fact });
      }
    }
    this.notify();
  }

  public removeSessionFact(id: string): void {
    if (this.isProtectedFact(id)) {
      console.warn(`[MemoryManager] Refused to delete seeded rule "${id}"; it is not user data.`);
      return;
    }
    this.state.sessionFacts = this.state.sessionFacts.filter((f) => f.id !== id);
    this.notify();
  }

  public updateCustomerMemory(updates: Partial<CustomerMemory>): void {
    // Defence in depth: the callers in this codebase only ever pass extracted, typed
    // entities, so this filter does not change their behaviour. It exists so that a new
    // caller cannot later forward a raw caller-supplied object and bypass the policy that
    // has always declared sensitive fields but, until now, enforced nothing.
    const safe: Partial<CustomerMemory> = {};
    const rejected: string[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === null) continue;
      if (this.isSensitiveField(key)) {
        rejected.push(key);
        continue;
      }
      (safe as Record<string, unknown>)[key] = value;
    }
    if (rejected.length > 0) {
      console.warn(`[MemoryManager] Refused to store sensitive field(s): ${rejected.join(', ')}`);
    }
    if (Object.keys(safe).length === 0) return;

    this.state.customerMemory = {
      ...this.state.customerMemory,
      ...safe,
      lastInteractionAt: Date.now(),
    };
    this.notify();
  }

  public formatForModelContext(): string {
    const factsList = this.state.sessionFacts
      .map((f) => `- [${f.category.toUpperCase()}]: ${f.content}`)
      .join('\n');

    const customerParts: string[] = [];
    if (this.state.customerMemory.name) customerParts.push(`Caller Name: ${this.state.customerMemory.name}`);
    if (this.state.customerMemory.email) customerParts.push(`Caller Email: ${this.state.customerMemory.email}`);
    if (this.state.customerMemory.phone) customerParts.push(`Caller Phone: ${this.state.customerMemory.phone}`);

    const prefs = Object.entries(this.state.customerMemory.preferences);
    if (prefs.length > 0) {
      customerParts.push(`Preferences: ${prefs.map(([k, v]) => `${k}=${v}`).join(', ')}`);
    }

    return [
      `=== STRUCTURED CALLER PROFILE ===`,
      customerParts.length > 0 ? customerParts.join('\n') : 'No confirmed caller profile data.',
      ``,
      `=== SESSION FACTS & EXTRACTED PREFERENCES ===`,
      factsList || 'No custom session facts recorded.',
    ].join('\n');
  }

  private saveToStorage(): void {
    const key = this.policy.sessionStorageNamespace(this.sessionId, this.personaId);
    try {
      sessionStorage.setItem(key, JSON.stringify(this.state));
    } catch (_) {}
  }

  private loadFromStorage(): void {
    const key = this.policy.sessionStorageNamespace(this.sessionId, this.personaId);
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.sessionId === this.sessionId && parsed.personaId === this.personaId) {
          this.state = {
            ...this.state,
            ...parsed,
          };
        }
      }
    } catch (_) {}
  }

  public clear(): void {
    this.state = {
      sessionId: this.sessionId,
      personaId: this.personaId,
      sessionFacts: [],
      customerMemory: { ...INITIAL_CUSTOMER_MEMORY },
    };
    const key = this.policy.sessionStorageNamespace(this.sessionId, this.personaId);
    try {
      sessionStorage.removeItem(key);
    } catch (_) {}
    this.notify();
  }
}
