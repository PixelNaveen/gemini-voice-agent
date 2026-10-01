/**
 * SECTION 17: Observability
 *
 * There was previously no way to tell whether a call was healthy. These counters plus the
 * live-session registry give operators (and the tests) a real signal, and they expose the
 * relay's internal state without leaking session content.
 */

export type ConnectionOutcome =
  | 'session_started'
  | 'session_resumed'
  | 'replacement_requested'
  | 'replacement_succeeded'
  | 'replacement_failed'
  | 'client_closed'
  | 'server_closed'
  | 'error_close'
  | 'rejected_frame'
  | 'unauthorized'
  | 'rate_limited'
  /** SECTION 09: the model asked for a tool. `reason` carries the tool name. */
  | 'tool_call'
  /** SECTION 09: a tool succeeded. `reason` carries the tool name. */
  | 'tool_ok'
  /** SECTION 09: a tool failed or was refused. `reason` carries the tool name. */
  | 'tool_failed';

export interface LiveSessionSnapshot {
  sessionId: string;
  connectionId: string;
  personaId: string;
  startedAt: number;
  lastActivityAt: number;
  generation: number;
  reconnects: number;
  audioChunks: number;
  inputChars: number;
  active: boolean;
  closeReason?: string;
}

export interface MetricsSnapshot {
  uptimeMs: number;
  sessionsStarted: number;
  sessionsResumed: number;
  activeSessions: number;
  replacementsRequested: number;
  replacementsSucceeded: number;
  replacementsFailed: number;
  totalReconnects: number;
  audioChunksIn: number;
  audioChunksOut: number;
  bytesIn: number;
  bytesOut: number;
  protocolRejections: number;
  unauthorized: number;
  rateLimited: number;
  errors: number;
  /** SECTION 09: tool activity, keyed `outcome:toolName`. */
  toolCalls: number;
  toolFailures: number;
  byToolOutcome: Record<string, number>;
  byOutcome: Record<string, number>;
  byReason: Record<string, number>;
}

export class LiveMetrics {
  private readonly clock: () => number;
  private readonly startedAt: number;
  private readonly outcomes = new Map<string, number>();
  private readonly reasons = new Map<string, number>();
  private readonly sessions = new Map<string, LiveSessionSnapshot>();
  /** SECTION 09: keyed `outcome:toolName`, so a broken provider is visible per tool. */
  private readonly toolOutcomes = new Map<string, number>();
  private toolCalls = 0;
  private toolFailures = 0;

  private sessionsStarted = 0;
  private sessionsResumed = 0;
  private replacementsRequested = 0;
  private replacementsSucceeded = 0;
  private replacementsFailed = 0;
  private totalReconnects = 0;
  private audioChunksIn = 0;
  private audioChunksOut = 0;
  private bytesIn = 0;
  private bytesOut = 0;
  private protocolRejections = 0;
  private unauthorized = 0;
  private rateLimited = 0;
  private errors = 0;

  constructor(options: { now?: () => number } = {}) {
    this.clock = options.now ?? (() => Date.now());
    this.startedAt = this.clock();
  }

  public increment(outcome: ConnectionOutcome, reason?: string): void {
    this.outcomes.set(outcome, (this.outcomes.get(outcome) ?? 0) + 1);
    if (outcome === 'session_started') this.sessionsStarted++;
    if (outcome === 'session_resumed') this.sessionsResumed++;
    if (outcome === 'replacement_requested') this.replacementsRequested++;
    if (outcome === 'replacement_succeeded') this.replacementsSucceeded++;
    if (outcome === 'replacement_failed') this.replacementsFailed++;
    if (outcome === 'rejected_frame') this.protocolRejections++;
    if (outcome === 'unauthorized') this.unauthorized++;
    if (outcome === 'rate_limited') this.rateLimited++;
    if (outcome === 'error_close' || outcome === 'server_closed') this.errors++;

    // F-21: tool outcomes are counted per tool name, so an operator can see that booking is
    // failing while hours lookup is fine. Without the per-tool breakdown, a deployment with a
    // broken calendar provider looks identical to a healthy one.
    if (outcome === 'tool_call' || outcome === 'tool_ok' || outcome === 'tool_failed') {
      const key = `${outcome}:${reason ?? 'unknown'}`;
      this.toolOutcomes.set(key, (this.toolOutcomes.get(key) ?? 0) + 1);
      if (outcome === 'tool_call') this.toolCalls++;
      if (outcome === 'tool_failed') this.toolFailures++;
    }

    if (reason) {
      this.reasons.set(reason, (this.reasons.get(reason) ?? 0) + 1);
    }
  }

  public trackBytes(direction: 'in' | 'out', bytes: number): void {
    if (direction === 'in') this.bytesIn += bytes;
    else this.bytesOut += bytes;
  }

  /** Called once per verified transport replacement. */
  public recordReconnect(): void {
    this.totalReconnects++;
  }

  public trackAudio(direction: 'in' | 'out', chunks = 1): void {
    if (direction === 'in') this.audioChunksIn += chunks;
    else this.audioChunksOut += chunks;
  }

  public registerSession(snapshot: LiveSessionSnapshot): void {
    this.sessions.set(snapshot.sessionId, { ...snapshot });
  }

  public updateSession(sessionId: string, patch: Partial<LiveSessionSnapshot>): void {
    const existing = this.sessions.get(sessionId);
    if (!existing) return;
    this.sessions.set(sessionId, { ...existing, ...patch });
  }

  public closeSession(sessionId: string, reason: string): void {
    const existing = this.sessions.get(sessionId);
    if (!existing) return;
    this.sessions.set(sessionId, {
      ...existing,
      active: false,
      lastActivityAt: this.clock(),
      closeReason: reason,
    });
  }

  /**
   * Prunes sessions closed longer ago than the retention window. Active sessions are never
   * pruned, no matter how long they have been quiet.
   */
  public sweep(retentionMs = 15 * 60_000): void {
    const cutoff = this.clock() - retentionMs;
    for (const [id, snapshot] of this.sessions) {
      if (!snapshot.active && snapshot.lastActivityAt <= cutoff) {
        this.sessions.delete(id);
      }
    }
  }

  public snapshot(): MetricsSnapshot {
    let active = 0;
    for (const s of this.sessions.values()) {
      if (s.active) active++;
    }
    return {
      uptimeMs: this.clock() - this.startedAt,
      sessionsStarted: this.sessionsStarted,
      sessionsResumed: this.sessionsResumed,
      activeSessions: active,
      replacementsRequested: this.replacementsRequested,
      replacementsSucceeded: this.replacementsSucceeded,
      replacementsFailed: this.replacementsFailed,
      totalReconnects: this.totalReconnects,
      audioChunksIn: this.audioChunksIn,
      audioChunksOut: this.audioChunksOut,
      bytesIn: this.bytesIn,
      bytesOut: this.bytesOut,
      protocolRejections: this.protocolRejections,
      unauthorized: this.unauthorized,
      rateLimited: this.rateLimited,
      errors: this.errors,
      toolCalls: this.toolCalls,
      toolFailures: this.toolFailures,
      byToolOutcome: Object.fromEntries(this.toolOutcomes),
      byOutcome: Object.fromEntries(this.outcomes),
      byReason: Object.fromEntries(this.reasons),
    };
  }

  public sessionList(limit = 50): LiveSessionSnapshot[] {
    return [...this.sessions.values()].sort((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, limit);
  }

  public get sessionCount(): number {
    return this.sessions.size;
  }
}
