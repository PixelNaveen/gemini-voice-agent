import { AuraSession } from '../../types';

/**
 * SECTION 02: Gemini Connection Authority
 *
 * Foundational Invariants:
 *
 * 1. MONOTONIC IDENTITY. A connection generation is ONLY ever allocated by this class,
 *    from a private counter. No other module may derive a generation by reading mutable
 *    session state and adding 1. This is what previously allowed two independent
 *    authorities (RecoveryManager and GoAwayRenewalManager) to mint two different
 *    connectionIds that both claimed the SAME generation.
 *
 * 2. SINGLE ACTIVE CONNECTION. At most ONE connection may be CURRENT at any instant.
 *    During a handoff the outgoing and incoming connections may coexist, but the
 *    incoming one is not CURRENT until it has been verified.
 *
 * 3. SINGLE-FLIGHT CREATION. At most ONE replacement connection may be IN FLIGHT.
 *    Every concurrent request (recovery, proactive renewal, resumption fallback)
 *    COALESCES onto that in-flight operation. Requests are never queued and never
 *    dropped: a coalesced caller receives the same verdict as the originator.
 *
 * 4. VERIFY BEFORE PROMOTE. A ticket becomes CURRENT only after the caller's run()
 *    resolves true (i.e. after the transport handshake was actually confirmed).
 *    A synchronous `return true` from a caller that has not connected yet can no
 *    longer promote an unverified connection.
 *
 * Nothing outside this class creates a Gemini connection.
 */
export type ConnectionPurpose = 'INITIAL' | 'RECOVERY' | 'RENEWAL' | 'FALLBACK';

export type ConnectionTicketState = 'ISSUED' | 'IN_FLIGHT' | 'CURRENT' | 'RETIRED' | 'FAILED';

export interface ConnectionTicket {
  connectionId: string;
  generation: number;
  purpose: ConnectionPurpose;
  issuedAt: number;
  state: ConnectionTicketState;
}

export interface ReplacementOutcome {
  ticket: ConnectionTicket;
  /** True when this outcome came from a connection this caller actually initiated. */
  owner: boolean;
  /** True when this caller's request was coalesced onto someone else's in-flight op. */
  coalesced: boolean;
  verified: boolean;
  error?: string;
}

export type ConnectionRunFn = (ticket: ConnectionTicket) => Promise<boolean>;

export interface ConnectionAuthorityOptions {
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Injectable id factory for deterministic tests. */
  makeId?: (generation: number) => string;
  onLog?: (message: string) => void;
}

export class ConnectionAuthority {
  private counter = 0;
  private current: ConnectionTicket | null = null;
  private inFlight: {
    ticket: ConnectionTicket;
    promise: Promise<ReplacementOutcome>;
    purpose: ConnectionPurpose;
    coalescedCount: number;
  } | null = null;
  private readonly retired: ConnectionTicket[] = [];
  private readonly now: () => number;
  private readonly makeId: (generation: number) => string;
  private readonly log: (message: string) => void;

  constructor(options: ConnectionAuthorityOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.makeId =
      options.makeId ??
      ((generation) => `conn_${this.now()}_g${generation}_${Math.random().toString(36).substring(2, 6)}`);
    this.log = options.onLog ?? ((message) => console.log(message));
  }

  /**
   * Allocates the next connection identity. Monotonic and never reused.
   */
  private allocate(purpose: ConnectionPurpose): ConnectionTicket {
    this.counter += 1;
    return {
      connectionId: this.makeId(this.counter),
      generation: this.counter,
      purpose,
      issuedAt: this.now(),
      state: 'ISSUED',
    };
  }

  /**
   * Issues the FIRST connection for a brand new AURA session.
   * Unconditional: an initial connect is never coalesced, because no other
   * connection can legitimately exist for a session that has not started yet.
   */
  public issueInitial(purpose: ConnectionPurpose = 'INITIAL'): ConnectionTicket {
    if (this.current && this.current.state === 'CURRENT') {
      throw new Error(
        `[ConnectionAuthority] Refusing to issue an initial connection while ${this.current.connectionId} is still CURRENT.`
      );
    }
    const ticket = this.allocate(purpose);
    ticket.state = 'CURRENT';
    this.current = ticket;
    this.log(
      `[ConnectionAuthority] Issued initial connection ${ticket.connectionId} (Gen ${ticket.generation})`
    );
    return ticket;
  }

  /**
   * Requests a replacement connection under single-flight control.
   *
   * - If a replacement is already in flight, this call COALESCES: it returns the
   *   same outcome and does not create a second connection.
   * - Otherwise it allocates a fresh generation, runs `run`, and promotes the
   *   ticket to CURRENT only if `run` resolves true.
   */
  public requestReplacement(purpose: ConnectionPurpose, run: ConnectionRunFn): Promise<ReplacementOutcome> {
    if (this.inFlight) {
      this.inFlight.coalescedCount += 1;
      const existing = this.inFlight;
      this.log(
        `[ConnectionAuthority] COALESCED ${purpose} request onto in-flight ${existing.ticket.connectionId} ` +
          `(Gen ${existing.ticket.generation}, ${existing.ticket.purpose}); ` +
          `total coalesced=${existing.coalescedCount}. No second connection will be created.`
      );
      return existing.promise.then((outcome) => ({ ...outcome, owner: false, coalesced: true }));
    }

    const ticket = this.allocate(purpose);
    ticket.state = 'IN_FLIGHT';
    this.log(
      `[ConnectionAuthority] Issuing replacement ${ticket.connectionId} (Gen ${ticket.generation}, ${purpose})`
    );

    const promise = (async (): Promise<ReplacementOutcome> => {
      try {
        const verified = await run(ticket);
        if (verified) {
          const previous = this.current;
          ticket.state = 'CURRENT';
          this.current = ticket;
          if (previous && previous.connectionId !== ticket.connectionId) {
            previous.state = 'RETIRED';
            this.retired.push(previous);
            this.log(
              `[ConnectionAuthority] PROMOTED ${ticket.connectionId} (Gen ${ticket.generation}); ` +
                `retired ${previous.connectionId} (Gen ${previous.generation})`
            );
          } else {
            this.log(
              `[ConnectionAuthority] PROMOTED ${ticket.connectionId} (Gen ${ticket.generation}) as current connection`
            );
          }
          return { ticket, owner: true, coalesced: false, verified: true };
        }

        ticket.state = 'FAILED';
        this.retired.push(ticket);
        this.log(
          `[ConnectionAuthority] Replacement ${ticket.connectionId} (Gen ${ticket.generation}) FAILED verification; ` +
            `current connection unchanged`
        );
        return { ticket, owner: true, coalesced: false, verified: false, error: 'verification_failed' };
      } catch (err: any) {
        ticket.state = 'FAILED';
        this.retired.push(ticket);
        const message = err?.message || String(err);
        this.log(
          `[ConnectionAuthority] Replacement ${ticket.connectionId} (Gen ${ticket.generation}) THREW: ${message}; ` +
            `current connection unchanged`
        );
        return { ticket, owner: true, coalesced: false, verified: false, error: message };
      }
    })();

    this.inFlight = { ticket, promise, purpose, coalescedCount: 0 };
    // Clear the in-flight slot only after the outcome is settled, so a request
    // arriving in the same microtask cannot start a competing connection.
    promise.finally(() => {
      if (this.inFlight && this.inFlight.ticket === ticket) {
        this.inFlight = null;
      }
    });

    return promise;
  }

  public getCurrent(): ConnectionTicket | null {
    return this.current && this.current.state === 'CURRENT' ? this.current : null;
  }

  public getInFlight(): ConnectionTicket | null {
    return this.inFlight ? this.inFlight.ticket : null;
  }

  public isInFlight(): boolean {
    return this.inFlight !== null;
  }

  /** True only for the single authoritative current connection. */
  public isCurrent(connectionId: string | null | undefined, generation?: number): boolean {
    const current = this.getCurrent();
    if (!current || !connectionId) return false;
    if (current.connectionId !== connectionId) return false;
    if (generation !== undefined && current.generation !== generation) return false;
    return true;
  }

  /**
   * Retires the current connection. Used on session end, hard reset, and persona switch.
   */
  public retireCurrent(reason: string): void {
    if (!this.current) return;
    this.current.state = 'RETIRED';
    this.retired.push(this.current);
    this.log(
      `[ConnectionAuthority] Retired current connection ${this.current.connectionId} ` +
        `(Gen ${this.current.generation}): ${reason}`
    );
    this.current = null;
  }

  /**
   * Releases every in-flight operation without promoting it. Used when a session
   * ends mid-handshake so a late-arriving socket can never be promoted.
   */
  public abortInFlight(reason: string): void {
    if (!this.inFlight) return;
    this.inFlight.ticket.state = 'RETIRED';
    this.retired.push(this.inFlight.ticket);
    this.log(
      `[ConnectionAuthority] ABORTED in-flight ${this.inFlight.ticket.connectionId} ` +
        `(Gen ${this.inFlight.ticket.generation}): ${reason}`
    );
    this.inFlight = null;
  }

  /** Full teardown for a new AURA session / persona switch. */
  public reset(reason = 'session reset'): void {
    this.abortInFlight(reason);
    this.retireCurrent(reason);
    this.counter = 0;
    this.retired.length = 0;
  }

  public getDiagnostics() {
    return {
      current: this.current
        ? { connectionId: this.current.connectionId, generation: this.current.generation, purpose: this.current.purpose }
        : null,
      inFlight: this.inFlight
        ? {
            connectionId: this.inFlight.ticket.connectionId,
            generation: this.inFlight.ticket.generation,
            purpose: this.inFlight.purpose,
            coalescedCount: this.inFlight.coalescedCount,
          }
        : null,
      allocations: this.counter,
      retiredCount: this.retired.length,
    };
  }

  /**
   * Fails fast if the architectural invariant is ever violated: two CURRENT
   * connections, or an in-flight connection that shares a generation with current.
   */
  public assertInvariants(): void {
    const current = this.getCurrent();
    if (this.inFlight && current && this.inFlight.ticket.generation === current.generation) {
      throw new Error(
        `[ConnectionAuthority] INVARIANT VIOLATION: in-flight ${this.inFlight.ticket.connectionId} shares ` +
          `generation ${current.generation} with current ${current.connectionId}`
      );
    }
    for (const r of this.retired) {
      if (current && r.connectionId === current.connectionId) {
        throw new Error(
          `[ConnectionAuthority] INVARIANT VIOLATION: ${r.connectionId} is both CURRENT and RETIRED`
        );
      }
    }
  }
}

/**
 * Convenience: bind a session's transport to the authority's current ticket.
 * Keeps `AuraSession.transport.connectionId` / `connectionGeneration` in lockstep
 * with the single source of truth, which removes the field skew that previously
 * let RecoveryManager and GoAwayRenewalManager disagree on the base generation.
 */
export function bindSessionToCurrentConnection(
  authority: ConnectionAuthority,
  session: AuraSession,
  connection: { connectionId: string; generation: number }
): void {
  const current = authority.getCurrent();
  if (!current || current.connectionId !== connection.connectionId) {
    throw new Error(
      `[ConnectionAuthority] Refusing to bind session to non-current connection ${connection.connectionId}`
    );
  }
  session.activeConnectionId = current.connectionId;
  session.connectionGeneration = current.generation;
  if (session.transport) {
    session.transport.connectionId = current.connectionId;
    session.transport.generation = current.generation;
    session.transport.connectionGeneration = current.generation;
  }
}
