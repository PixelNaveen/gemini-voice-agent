/**
 * F-11: server-side session registry.
 *
 * The relay previously held `activeSessionId` as a local inside the per-socket connection
 * handler. That made the call unrecoverable across a browser refresh: the socket died, the
 * closure and its sessionId went with it, and the next page load opened a brand new call
 * with a fresh greeting. The caller heard the agent introduce itself twice.
 *
 * This registry is the server's memory of a call, keyed by `sessionId` and independent of any
 * one socket, so a reconnecting browser can ask "what was I in the middle of?" and be told,
 * rather than starting over.
 *
 * Design constraints that shaped this:
 *
 * - **Bounded.** An unbounded map keyed by caller-supplied session ids is a memory-exhaustion
 *   target. Entries expire on a TTL, the map has a hard cap, and the oldest idle entry is
 *   evicted first, so an attacker cannot grow it without limit.
 * - **Content-free.** The registry stores the call's *shape* (persona, stage, timestamps,
 *   counters) and never transcript text, caller name, or anything else that would turn this
 *   into a store of personal data. The browser still owns its own transcript.
 * - **Not an authority.** Nothing here is trusted as business truth on resume. It lets the
 *   server suppress a duplicate greeting and restore the persona and stage; it never invents
 *   a booking or a slot.
 */

import path from 'path';

import { readJournal, updateJournal } from '../../persistence/stores/JournalFile';

export type SessionStage =
  | 'initiated'
  | 'greeting_sent'
  | 'listening'
  | 'agent_speaking'
  | 'tool_running'
  | 'recovering'
  | 'ended';

export interface ResumableSession {
  sessionId: string;
  personaId: string;
  stage: SessionStage;
  startedAt: number;
  lastActivityAt: number;
  /** How many sockets have attached to this call, including the current one. */
  attachments: number;
  /** How many times the call has been recovered after a transport loss. */
  recoveries: number;
  /** Set once the caller has already heard a greeting, so a resume does not repeat it. */
  greeted: boolean;
}

export interface ResumeHint {
  /** True when the call is known to the server and can continue rather than restart. */
  resumable: true;
  personaId: string;
  stage: SessionStage;
  /** The server instructs the client not to greet again on this resume. */
  suppressGreeting: boolean;
  recoveries: number;
  startedAt: number;
  /** Human-readable, surfaced to the caller as a transparent interruption, never as an error. */
  notice: string;
}

export interface SessionRegistryOptions {
  /** How long a call may sit idle before the server forgets it. */
  ttlMs?: number;
  /** Hard ceiling on tracked calls, so the map cannot grow without bound. */
  maxSessions?: number;
  /** Injectable clock, so expiry is testable without waiting in real time. */
  now?: () => number;
  /**
   * Journal file backing this registry. When set, session state survives a server restart, so
   * a browser refresh that lands after a deploy resumes the same call instead of starting a new
   * one with a second greeting.
   */
  persistTo?: string;
}

/**
 * How long a session stays resumable after its last activity.
 *
 * Five minutes, because that is the window a caller actually needs. A refresh, a dropped
 * connection, or a phone that went to sleep and came back are all measured in tens of
 * seconds; the previous two minutes expired during ordinary use, so a caller who refreshed
 * after a two-minute pause silently lost the call and got a fresh greeting from a receptionist
 * with no memory of them. Five minutes absorbs that without holding session state open long
 * enough to matter, and the value is overridable because the right window is a product
 * decision rather than a constant.
 */
const DEFAULT_TTL_MS = Number(process.env.AURA_SESSION_TTL_MS || 5 * 60 * 1000);
const DEFAULT_MAX_SESSIONS = 500;

export class SessionRegistry {
  private readonly sessions = new Map<string, ResumableSession>();
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly now: () => number;
  private readonly persistTo: string | undefined;

  constructor(options: SessionRegistryOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.now = options.now ?? (() => Date.now());
    this.persistTo = options.persistTo;
    if (this.persistTo) this.hydrate();
  }

  /**
   * Mirrors the in-memory map to the journal after every mutation.
   *
   * Deliberately best-effort, and deliberately never throws. Sessions exist to make a call
   * recoverable; if the disk is unavailable, the correct behaviour is to keep serving the live
   * call from memory and lose only the ability to survive a restart. Throwing here would turn
   * a degraded-session-registry into a dropped call, which is strictly worse than the problem
   * being solved. The failure is not hidden - `durable` reports it, and the readiness probe
   * surfaces an unwritable data directory.
   */
  private persist(): void {
    if (!this.persistTo) return;
    const snapshot = [...this.sessions.values()];
    const result = updateJournal<ResumableSession>(this.persistTo, () => snapshot);
    this.durable = result.ok;
  }

  /** False once a mirror write has failed, so operators can see the degradation. */
  public durable = true;

  /**
   * Reloads prior state on boot, discarding anything already past its TTL.
   *
   * Expired rows are dropped rather than revived: a session id from an hour-old process is not
   * resumable, and honouring it would suppress a greeting for a call the caller has forgotten.
   */
  private hydrate(): void {
    if (!this.persistTo) return;
    let loaded: ResumableSession[];
    try {
      loaded = readJournal<ResumableSession>(this.persistTo);
    } catch {
      // An unreadable journal must not take the relay down at boot. Start empty and let the
      // caller open a fresh call; claiming a session we cannot read would be worse.
      this.durable = false;
      return;
    }
    const cutoff = this.now() - this.ttlMs;
    for (const session of loaded) {
      if (!session || typeof session.sessionId !== 'string') continue;
      if (session.lastActivityAt < cutoff) continue;
      this.sessions.set(session.sessionId, session);
    }
    if (loaded.length !== this.sessions.size) this.persist();
  }

  /**
   * Whether a caller-supplied persona contradicts the one this call was established with.
   *
   * The persona is the *identity* of the call, and the registry is the server's record of that
   * identity. `attach` used to let the record follow whatever persona the client last sent, which
   * meant a reconnect could silently re-brand an in-progress call: the session still carried the
   * old session's `greeted` flag and `startedAt`, so the caller would hear "you are still talking
   * to the salon receptionist" from an agent now presenting as a different business. That is a
   * context-integrity failure, not a cosmetic one - the continuity guarantee and the identity
   * guarantee cannot both be honoured.
   *
   * A genuine persona switch is not blocked by this. The client performs a hard reset first
   * (see the persona boundary in `useVoiceAgent`), which rotates the `sessionId`, so a new persona
   * always arrives as a *new* session rather than a rebind of an existing one.
   */
  public personaMismatch(sessionId: string, personaId: string): boolean {
    const session = this.get(sessionId);
    if (!session) return false;
    return session.personaId !== personaId;
  }

  /**
   * Records a new call, or re-attaches an existing one.
   *
   * Calling this for a session id that already exists must NOT reset the call: that is the
   * refresh case, and wiping `greeted` here is precisely the bug that produces a double
   * greeting. The existing record is preserved and only its counters and liveness advance.
   *
   * The persona on an existing record is immutable. Callers must consult `personaMismatch` first
   * and refuse a contradictory identity rather than asking `attach` to overwrite one.
   */
  attach(sessionId: string, personaId: string): ResumableSession {
    this.evictExpired();
    const ts = this.now();
    const existing = this.sessions.get(sessionId);

    if (existing) {
      existing.attachments += 1;
      existing.lastActivityAt = ts;
      this.persist();
      return existing;
    }

    this.evictOldestIfFull();
    const created: ResumableSession = {
      sessionId,
      personaId,
      stage: 'initiated',
      startedAt: ts,
      lastActivityAt: ts,
      attachments: 1,
      recoveries: 0,
      greeted: false,
    };
    this.sessions.set(sessionId, created);
    this.persist();
    return created;
  }

  /** Marks that the caller has heard the greeting, so a later resume will not repeat it. */
  markGreeted(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.greeted = true;
    session.stage = 'listening';
    session.lastActivityAt = this.now();
    this.persist();
  }

  /** Records a transport loss that will be or has been recovered. */
  markRecovered(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.recoveries += 1;
    session.stage = 'recovering';
    session.lastActivityAt = this.now();
    this.persist();
  }

  public setStage(sessionId: string, stage: SessionStage): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.stage = stage;
    session.lastActivityAt = this.now();
    this.persist();
  }

  /** Any call activity refreshes the TTL. */
  public touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.lastActivityAt = this.now();
  }

  public get(sessionId: string): ResumableSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (this.now() - session.lastActivityAt > this.ttlMs) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return session;
  }

  /**
   * Whether a call may be resumed, and with what.
   *
   * `greeted` is the load-bearing field. A resume after a refresh must not replay the
   * introduction, so the caller is told explicitly to suppress it rather than each side
   * guessing.
   */
  public resumeHint(sessionId: string): ResumeHint | null {
    const session = this.get(sessionId);
    if (!session) return null;
    return {
      resumable: true,
      personaId: session.personaId,
      stage: session.stage,
      suppressGreeting: session.greeted,
      recoveries: session.recoveries,
      startedAt: session.startedAt,
      notice: session.greeted
        ? 'The connection was interrupted and is being reconnected. One moment.'
        : 'The connection was interrupted before the call began. One moment.',
    };
  }

  public end(sessionId: string): void {
    if (!this.sessions.delete(sessionId)) return;
    this.persist();
  }

  public get size(): number {
    return this.sessions.size;
  }

  /**
   * Drops sessions idle past the TTL.
   *
   * A browser that closes its tab without a goodbye frame would otherwise leak an entry
   * forever, so expiry is what keeps the registry honest between clean disconnects.
   */
  private evictExpired(): void {
    const cutoff = this.now() - this.ttlMs;
    let removed = false;
    for (const [id, session] of this.sessions) {
      if (session.lastActivityAt < cutoff) {
        this.sessions.delete(id);
        removed = true;
      }
    }
    if (removed) this.persist();
  }

  /** Enforces the hard cap by dropping the least recently active call. */
  private evictOldestIfFull(): void {
    if (this.sessions.size < this.maxSessions) return;
    let oldestId: string | null = null;
    let oldestAt = Infinity;
    for (const [id, session] of this.sessions) {
      if (session.lastActivityAt < oldestAt) {
        oldestAt = session.lastActivityAt;
        oldestId = id;
      }
    }
    if (oldestId) {
      this.sessions.delete(oldestId);
      this.persist();
    }
  }
}

/** Process-wide registry shared by the relay. */
let singleton: SessionRegistry | null = null;

/**
 * Mirrors the same `AURA_DATA_DIR` the appointment and tool-operation journals use, so all
 * durable state for an instance lives in one place instead of being scattered by module.
 */
function defaultSessionJournal(): string {
  const dir = process.env.AURA_DATA_DIR || path.resolve(process.cwd(), '.data');
  return path.join(dir, 'sessions.json');
}

export function getSessionRegistry(): SessionRegistry {
  if (!singleton) singleton = new SessionRegistry({ persistTo: defaultSessionJournal() });
  return singleton;
}

/** Test seam: drops the singleton so each suite starts clean. */
export function resetSessionRegistry(): void {
  singleton = null;
}
