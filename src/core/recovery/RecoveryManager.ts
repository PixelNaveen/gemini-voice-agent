import { RetryScheduler } from './RetryScheduler';
import { ErrorRecoveryPolicy } from '../errors/ErrorRecoveryPolicy';
import { SessionContext, AuraSession, RecoveryStatus } from '../../types';
import { AuraSessionManager } from '../session/AuraSessionManager';
import { ConnectionAuthority, ConnectionTicket } from '../connection/ConnectionAuthority';

export type RecoveryState =
  | 'NONE'
  | 'REQUESTED'
  | 'CLASSIFYING'
  | 'SCHEDULED'
  | 'CONNECTING'
  | 'SUCCEEDED'
  | 'EXHAUSTED'
  | 'CANCELLED';

export type FailureCategory = 'INTENTIONAL' | 'RECOVERABLE' | 'VALIDATED_RETRY' | 'TERMINAL';

export interface FailureReport {
  source: 'GEMINI' | 'WEBSOCKET' | 'WATCHDOG' | 'MANUAL';
  reason: string;
  code?: number | string;
  timestamp: number;
}

export interface RecoveryOperation {
  id: string;
  sessionId: string;
  generation: number;
  startedAt: number;
  attempt: number;
  category: FailureCategory;
  reports: FailureReport[];
  state: RecoveryState;
  mode: 'RESUME' | 'FRESH';
  resumptionHandle: string | null;
  /** Ticket actually issued by the Connection Authority for this attempt. */
  ticket: ConnectionTicket | null;
}

export interface RecoveryManagerCallbacks {
  /**
   * Creates and VERIFIES a replacement Gemini connection.
   * MUST resolve true only after the transport handshake has actually completed.
   * Resolving true without connecting is forbidden: the Connection Authority promotes
   * the ticket to CURRENT on a true result.
   */
  onReconnectInitiated?: (
    ticket: ConnectionTicket,
    recoveryOpId: string,
    mode: 'RESUME' | 'FRESH',
    resumptionHandle: string | null
  ) => Promise<boolean>;
  onRecoveryExhausted?: (context: SessionContext, message: string) => void;
  onStatusChanged?: (recStatus: RecoveryStatus) => void;
}

/**
 * SECTION 05: Single Recovery Authority
 *
 * Foundational Invariant:
 * EXACTLY ONE component owns the decision to recover a failed Gemini connection: RecoveryManager.
 *
 * - Gemini callbacks, WebSocket events, and watchdogs only REPORT failure.
 * - RecoveryManager classifies, deduplicates, applies bounded backoff with jitter, and
 *   delegates identity allocation + creation single-flight to the Connection Authority.
 * - RecoveryManager NEVER computes a connection generation. It did so previously, which
 *   allowed it to collide with GoAwayRenewalManager's independently computed generation.
 * - Recovery NEVER creates a new AURA session, never changes persona, never clears memory.
 * - Recovery is immediately CANCELLED on intentional shutdown.
 */
export class RecoveryManager {
  private scheduler = new RetryScheduler();
  private state: RecoveryState = 'NONE';
  private attemptCount = 0;
  private currentOp: RecoveryOperation | null = null;
  private callbacks?: RecoveryManagerCallbacks;
  private authority: ConnectionAuthority | null = null;
  private log: (m: string) => void = (m) => console.log(m);
  /**
   * The session the current recovery is repairing. Retained so a failed handshake can
   * schedule its own next attempt with proper backoff instead of stalling until some
   * unrelated watchdog timeout eventually fires.
   */
  private recoveringSession: AuraSession | null = null;

  constructor(
    options?:
      | RecoveryManagerCallbacks
      | (() => Promise<boolean>)
      | (RecoveryManagerCallbacks & { authority?: ConnectionAuthority; onLog?: (m: string) => void })
  ) {
    if (typeof options === 'function') {
      this.callbacks = {
        onReconnectInitiated: async () => options(),
      };
    } else if (options) {
      const { authority, onLog, ...callbacks } = options as RecoveryManagerCallbacks & {
        authority?: ConnectionAuthority;
        onLog?: (m: string) => void;
      };
      this.callbacks = callbacks;
      this.authority = authority ?? null;
      if (onLog) this.log = onLog;
    }
  }

  public setAuthority(authority: ConnectionAuthority): void {
    this.authority = authority;
  }

  public getState(): RecoveryState {
    return this.state;
  }

  public getAttemptCount(): number {
    return this.attemptCount;
  }

  public getCurrentOperation(): RecoveryOperation | null {
    return this.currentOp;
  }

  /**
   * Classifies a failure event into failure categories.
   */
  public static classifyFailure(
    source: string,
    reason: string,
    code?: number | string
  ): FailureCategory {
    const r = (reason || '').toLowerCase();

    if (
      r.includes('user_ended') ||
      r.includes('persona_switch') ||
      r.includes('time_limit') ||
      r.includes('server_shutdown') ||
      code === 1000
    ) {
      return 'INTENTIONAL';
    }

    if (
      r.includes('invalid_credential') ||
      r.includes('api_key_invalid') ||
      r.includes('unauthorized') ||
      r.includes('revoked') ||
      r.includes('invalid_model') ||
      r.includes('policy_violation')
    ) {
      return 'TERMINAL';
    }

    if (
      r.includes('quota') ||
      r.includes('resource_exhausted') ||
      r.includes('429') ||
      r.includes('503') ||
      r.includes('overloaded')
    ) {
      return 'VALIDATED_RETRY';
    }

    return 'RECOVERABLE';
  }

  /**
   * Single entry point for every failure event in the system.
   */
  public reportFailure(
    activeSession: AuraSession | null,
    source: FailureReport['source'],
    reason: string,
    code?: number | string
  ): boolean {
    if (!activeSession) return false;
    const context: SessionContext = activeSession.context;
    const now = Date.now();

    const category = RecoveryManager.classifyFailure(source, reason, code);

    this.log(
      `[RecoveryAuthority] Failure reported: session=${context.sessionId} source=${source} category=${category} reason="${reason}"`
    );

    if (category === 'INTENTIONAL') {
      this.cancel(`Intentional failure reported: ${reason}`);
      return false;
    }

    if (category === 'TERMINAL') {
      this.state = 'EXHAUSTED';
      this.authority?.abortInFlight(`terminal failure: ${reason}`);
      this.callbacks?.onRecoveryExhausted?.(context, `Fatal terminal failure: ${reason}`);
      return false;
    }

    if (!AuraSessionManager.canRecover(activeSession)) {
      this.log(
        `[RecoveryAuthority] Session ${context.sessionId} ineligible for recovery (Status: ${activeSession.status}). Aborting.`
      );
      return false;
    }

    // Guard 1 (RecoveryManager-local): a recovery op of ours is already scheduled/running.
    if (this.currentOp && (this.state === 'SCHEDULED' || this.state === 'CONNECTING')) {
      this.log(
        `[RecoveryAuthority] RECOVERY_ALREADY_IN_PROGRESS: Collapsing ${source} failure into ${this.currentOp.id}`
      );
      this.currentOp.reports.push({ source, reason, code, timestamp: now });
      return true;
    }

    // Guard 2 (system-wide): the Connection Authority already has a replacement in
    // flight, possibly requested by GoAway renewal. This is the cross-authority check
    // that did not exist before and is what allowed two generation-2 connections.
    if (this.authority && this.authority.isInFlight()) {
      const inflight = this.authority.getInFlight();
      this.log(
        `[RecoveryAuthority] COALESCING ${source} failure onto Connection Authority's in-flight ` +
          `${inflight?.connectionId} (Gen ${inflight?.generation}). No second connection will be created.`
      );
      return true;
    }

    if (this.attemptCount >= ErrorRecoveryPolicy.MAX_RETRY_ATTEMPTS) {
      this.state = 'EXHAUSTED';
      this.log(
        `[RecoveryAuthority] Recovery exhausted for session ${context.sessionId} after ${this.attemptCount} attempts.`
      );
      this.callbacks?.onRecoveryExhausted?.(
        context,
        `Connection recovery exhausted after ${this.attemptCount} attempts.`
      );
      return false;
    }

    this.attemptCount += 1;
    const opId = `rec_op_${now}_${Math.random().toString(36).substring(2, 6)}`;

    const isEligible = AuraSessionManager.isResumptionEligible(activeSession);
    const resumptionHandle = isEligible ? activeSession.transport.resumption?.handle ?? null : null;
    const mode: 'RESUME' | 'FRESH' = isEligible ? 'RESUME' : 'FRESH';

    this.log(
      `[RecoveryAuthority] Strategy selection for session ${context.sessionId}: mode=${mode} ` +
        `(Eligible=${isEligible}, Handle=${resumptionHandle ? resumptionHandle.substring(0, 8) + '...' : 'none'})`
    );

    this.currentOp = {
      id: opId,
      sessionId: context.sessionId,
      generation: 0, // Assigned by the Connection Authority, never computed here.
      startedAt: now,
      attempt: this.attemptCount,
      category,
      reports: [{ source, reason, code, timestamp: now }],
      state: 'SCHEDULED',
      mode,
      resumptionHandle,
      ticket: null,
    };
    this.recoveringSession = activeSession;

    // Fast-path reconnect: When a valid session resumption handle is available, attempt the initial
    // recovery immediately (80-120ms) rather than waiting >1.2s, preserving conversation flow.
    const isFastResume = mode === 'RESUME' && this.attemptCount === 1;
    const baseDelay = isFastResume ? 80 : (category === 'VALIDATED_RETRY' ? 2000 : 800);
    const exponentialDelay = isFastResume ? 80 : Math.min(baseDelay * Math.pow(2, this.attemptCount - 1), 5000);
    const jitter = isFastResume ? Math.floor(Math.random() * 40) : Math.floor(Math.random() * 250);
    const delayMs = exponentialDelay + jitter;

    this.state = 'SCHEDULED';
    this.callbacks?.onStatusChanged?.('SCHEDULED');

    this.log(
      `[RecoveryAuthority] Scheduled recovery ${opId} (Attempt ${this.attemptCount}/${ErrorRecoveryPolicy.MAX_RETRY_ATTEMPTS}, Mode: ${mode}) in ${delayMs}ms`
    );

    this.scheduler.schedule(() => {
      if (!this.currentOp || this.state === 'CANCELLED') {
        this.log(`[RecoveryAuthority] Recovery ${opId} dropped: operation was cancelled while waiting.`);
        return;
      }
      void this.executeReplacement(opId, mode, resumptionHandle);
    }, delayMs);

    return true;
  }

  /**
   * Executes the replacement through the Connection Authority, which owns generation
   * allocation and single-flight creation.
   */
  private async executeReplacement(
    opId: string,
    mode: 'RESUME' | 'FRESH',
    resumptionHandle: string | null
  ): Promise<void> {
    const run = async (ticket: ConnectionTicket): Promise<boolean> => {
      this.state = 'CONNECTING';
      if (this.currentOp) {
        this.currentOp.state = 'CONNECTING';
        this.currentOp.generation = ticket.generation;
        this.currentOp.ticket = ticket;
      }

      this.log(
        `[RecoveryAuthority] Executing replacement: ${ticket.connectionId} (Gen ${ticket.generation}, Mode: ${mode})`
      );

      const ok = (await this.callbacks?.onReconnectInitiated?.(ticket, opId, mode, resumptionHandle)) ?? false;

      if (ok) {
        this.state = 'SUCCEEDED';
        this.currentOp = null;
        this.recoveringSession = null;
        this.attemptCount = 0;
        this.callbacks?.onStatusChanged?.('SUCCEEDED');
        this.log(`[RecoveryAuthority] Replacement ${ticket.connectionId} verified. Recovery succeeded.`);
      } else {
        this.log(
          `[RecoveryAuthority] Replacement ${ticket.connectionId} did NOT verify. Scheduling next attempt.`
        );
        // Leave currentOp set so the next report is still attributable, and let the
        // caller's own onclose/timer produce the next attempt.
        this.state = 'REQUESTED';
        if (this.currentOp) this.currentOp.state = 'REQUESTED';
        this.scheduleNextAttempt(
          ticket.connectionId,
          `Replacement ${ticket.connectionId} failed handshake verification`
        );
      }
      return ok;
    };

    // The Connection Authority is the ONLY allocator of connection identity. If it is not
    // wired, this manager refuses to invent a ticket: fabricating a generation here is
    // precisely the bug that let RecoveryManager and GoAwayRenewalManager mint two
    // different connection ids for the same generation.
    if (!this.authority) {
      const context = this.recoveringSession?.context;
      this.state = 'EXHAUSTED';
      this.log(
        '[RecoveryAuthority] REFUSING to create a replacement: no Connection Authority is wired. ' +
          'Connection identity may only be allocated by ConnectionAuthority.'
      );
      if (context) {
        this.callbacks?.onRecoveryExhausted?.(
          context,
          'Recovery unavailable: the connection authority is not configured.'
        );
      }
      return;
    }

    await this.authority.requestReplacement('RECOVERY', run);
  }

  /**
   * SECTION 05: Bounded retry after a failed handshake.
   *
   * A replacement socket that never verifies is the most common recovery failure, and it
   * produces no further failure events of its own: the socket was discarded, not closed.
   * Without this the manager sat in REQUESTED forever and the caller stayed silent until
   * the watchdog's much longer silence timeout eventually fired.
   *
   * Re-entering through `reportFailure` is deliberate: it reuses the same
   * MAX_RETRY_ATTEMPTS bound, the same exponential backoff with jitter, and the same
   * cross-authority coalescing, so a retry cannot bypass any of those guards.
   */
  private scheduleNextAttempt(failedConnectionId: string, reason: string): void {
    const session = this.recoveringSession;
    if (!session) {
      this.log('[RecoveryAuthority] Cannot schedule a retry: the recovering session is no longer known.');
      return;
    }

    // Let the in-flight slot clear before requesting another replacement, otherwise the
    // retry would just coalesce onto the operation that just failed.
    setTimeout(() => {
      if (this.state === 'CANCELLED' || this.state === 'SUCCEEDED' || this.state === 'EXHAUSTED') {
        this.log(`[RecoveryAuthority] Retry for ${failedConnectionId} abandoned: state is ${this.state}.`);
        return;
      }
      const accepted = this.reportFailure(session, 'WEBSOCKET', reason);
      this.log(
        accepted
          ? `[RecoveryAuthority] Retry accepted for ${failedConnectionId} (attempt ${this.attemptCount}/${ErrorRecoveryPolicy.MAX_RETRY_ATTEMPTS}).`
          : `[RecoveryAuthority] Retry for ${failedConnectionId} was not accepted; recovery is ending.`
      );
    }, 0);
  }

  /**
   * SECTION 07: Fallback from failed resumption to a fresh connection.
   * Goes through the same Connection Authority, so it cannot collide with a
   * concurrently running GoAway renewal.
   */
  public fallbackToFresh(activeSession: AuraSession): Promise<boolean> {
    if (!activeSession || !AuraSessionManager.canRecover(activeSession)) {
      this.log('[RecoveryAuthority] Fallback to fresh connection aborted: session ineligible.');
      return Promise.resolve(false);
    }

    this.log('[RecoveryAuthority] Resumption rejected by provider. Falling back to a fresh connection...');
    AuraSessionManager.clearResumption(activeSession);

    if (this.currentOp) {
      this.currentOp.mode = 'FRESH';
      this.currentOp.resumptionHandle = null;
    }

    const opId = this.currentOp?.id || `rec_fallback_${Date.now()}`;

    const run = async (ticket: ConnectionTicket): Promise<boolean> => {
      this.log(
        `[RecoveryAuthority] Fresh fallback connection: ${ticket.connectionId} (Gen ${ticket.generation})`
      );
      return (await this.callbacks?.onReconnectInitiated?.(ticket, opId, 'FRESH', null)) ?? false;
    };

    // Same rule as executeReplacement: only the Connection Authority may mint identity.
    if (!this.authority) {
      this.log(
        '[RecoveryAuthority] REFUSING to create a fallback connection: no Connection Authority is wired.'
      );
      this.state = 'EXHAUSTED';
      this.callbacks?.onRecoveryExhausted?.(
        activeSession.context,
        'Resumption fallback unavailable: the connection authority is not configured.'
      );
      return Promise.resolve(false);
    }

    return this.authority.requestReplacement('FALLBACK', run).then((outcome) => {
      if (outcome.verified) {
        this.state = 'SUCCEEDED';
        this.currentOp = null;
        this.recoveringSession = null;
        this.attemptCount = 0;
      }
      return outcome.verified;
    });
  }

  public handleDisconnect(activeSession: AuraSession, source: string, reason: string): void {
    const validSource: FailureReport['source'] =
      source === 'GEMINI' || source === 'WEBSOCKET' || source === 'WATCHDOG' || source === 'MANUAL'
        ? source
        : 'WEBSOCKET';
    this.reportFailure(activeSession, validSource, reason);
  }

  /**
   * Called by the transport layer when a connection is confirmed healthy.
   * Idempotent: safe to call for the initial connect and for every replacement.
   */
  public onConnectSuccess(context?: SessionContext | null, connectionId?: string, connectionGeneration?: number): void {
    this.scheduler.cancel();
    const prevOpId = this.currentOp?.id;
    this.state = 'SUCCEEDED';
    this.currentOp = null;
    this.recoveringSession = null;
    this.attemptCount = 0;
    this.log(`[RecoveryAuthority] Connection healthy: ${connectionId || 'unknown'} (Op: ${prevOpId || 'initial'})`);
    this.callbacks?.onStatusChanged?.('SUCCEEDED');
  }

  public cancel(reason = 'Cancelled by caller'): void {
    this.scheduler.cancel();

    // SECTION 02: The Connection Authority is shared. Cancelling a RECOVERY must not abort
    // a replacement that the GoAway renewal manager legitimately owns: that used to kill
    // an in-progress proactive renewal and leave the session with no healthy transport at
    // all. Only an in-flight operation that is provably OURS is aborted.
    const inflight = this.authority?.getInFlight();
    const ourTicket = this.currentOp?.ticket;
    if (inflight && ourTicket && inflight.connectionId === ourTicket.connectionId) {
      this.authority?.abortInFlight(reason);
    } else if (inflight) {
      this.log(
        `[RecoveryAuthority] Not aborting in-flight ${inflight.connectionId} (Gen ${inflight.generation}, ` +
          `${inflight.purpose}): it is not owned by this recovery operation. Reason: ${reason}`
      );
    }

    if (this.currentOp) {
      this.log(`[RecoveryAuthority] Cancelling active recovery ${this.currentOp.id} (Reason: ${reason})`);
    }
    this.state = 'CANCELLED';
    this.currentOp = null;
    this.recoveringSession = null;
    this.attemptCount = 0;
  }

  public reset(): void {
    this.cancel('Reset');
    this.state = 'NONE';
    this.attemptCount = 0;
  }
}
