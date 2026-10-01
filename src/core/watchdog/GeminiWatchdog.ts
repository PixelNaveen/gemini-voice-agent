import { AuraSession } from '../../types';
import { RecoveryManager } from '../recovery/RecoveryManager';

/**
 * SECTION 09: Gemini Connection Watchdog (v2 — multi-signal health model)
 *
 * Foundational Invariants:
 *
 * - An OPEN WebSocket does not prove a healthy Gemini connection, and a GAP IN AUDIO
 *   does not prove a dead one. The previous implementation treated "no audio chunk for
 *   6s while SPEAKING" as DEAD, which fires routinely on a perfectly healthy connection
 *   whenever the model finishes sending a long turn while the client is still draining
 *   its playback buffer. That false positive triggered spurious recovery and, combined
 *   with the duplicated connection authority, ended live calls.
 *
 * - A stall is only declared when MULTIPLE INDEPENDENT SIGNALS agree:
 *     (a) no provider event of ANY kind for stallTimeoutMs, AND
 *     (b) we are genuinely expecting model output (a turn is open), AND
 *     (c) we are not inside a local playback-drain window, AND
 *     (d) no recovery is already in flight, AND
 *     (e) the ticket we monitor is still the authority's current connection.
 *
 * - The watchdog NEVER creates or closes a connection. It only reports to RecoveryManager.
 *
 * - The watchdog NEVER stops itself because the connection changed. It rebinds via
 *   updateConnection(). The previous version called this.stop() on a transient mismatch
 *   during a handoff, which left the watchdog permanently dead after the first recovery.
 */
export type WatchdogHealthClassification = 'HEALTHY' | 'DEGRADED' | 'STALLED' | 'DEAD';

/**
 * Turn-level stage. Distinct from playback position: SPEAKING means "the model is
 * producing a turn", and it ends when the model stops producing, not when the last
 * byte finishes playing.
 */
export type ConversationalActivityStage =
  | 'IDLE'
  | 'LISTENING'
  | 'AWAITING_FIRST_TOKEN'
  | 'SPEAKING'
  | 'DRAINING_PLAYBACK'
  | 'TOOL_EXECUTION'
  | 'RECOVERING';

export interface WatchdogMetrics {
  sessionId: string;
  connectionId: string;
  connectionGeneration: number;
  startedAt: number;
  rebindCount: number;
  /** Any frame of any type received from the provider relay. */
  lastProviderEventAt: number;
  lastAudioReceivedAt: number;
  lastTranscriptAt: number;
  lastOutboundAudioAt: number;
  lastOperationSuccessAt: number;
  /** A model turn is open (we are waiting for or receiving model output). */
  turnOpen: boolean;
  turnOpenedAt: number;
  /** Bytes still sitting in the local playback queue. */
  playbackPending: number;
  stage: ConversationalActivityStage;
  lastClassification: WatchdogHealthClassification;
  lastFailureReason?: string;
}

export interface WatchdogOptions {
  /** How often health is evaluated. Default 2000ms. */
  checkIntervalMs?: number;
  /**
   * How long we wait for the FIRST model byte after the caller speaks.
   * Generous by default: model cold-start, tool execution, and VAD tail are normal.
   */
  firstTokenTimeoutMs?: number;
  /**
   * How long the model may legitimately go without producing ANY provider event once
   * a turn is open, before we call the connection stalled. This is the value that was
   * previously 6000ms and was the source of the false positives.
   */
  stallTimeoutMs?: number;
  /** Absolute silence with no open turn. Purely informational; never a failure. */
  idleSilenceReportMs?: number;
  onFailureDetected?: (reason: string, classification: WatchdogHealthClassification) => void;
  onClassificationChanged?: (classification: WatchdogHealthClassification) => void;
  onLog?: (message: string) => void;
  now?: () => number;
}

const DEFAULTS = {
  checkIntervalMs: 2000,
  firstTokenTimeoutMs: 15000,
  stallTimeoutMs: 20000,
  idleSilenceReportMs: 30000,
};

export class GeminiWatchdog {
  private timer: ReturnType<typeof setInterval> | null = null;
  private metrics: WatchdogMetrics;
  private readonly options: Required<Omit<WatchdogOptions, 'onFailureDetected' | 'onClassificationChanged' | 'onLog' | 'now'>> & {
    onFailureDetected: (reason: string, classification: WatchdogHealthClassification) => void;
    onClassificationChanged: (classification: WatchdogHealthClassification) => void;
    onLog: (message: string) => void;
    now: () => number;
  };
  private readonly recoveryManager: RecoveryManager;
  private readonly getActiveSession: () => AuraSession | null;
  private isRunning = false;
  private reportedFailureFor: string | null = null;

  constructor(
    sessionId: string,
    connectionId: string,
    connectionGeneration: number,
    recoveryManager: RecoveryManager,
    getActiveSession: () => AuraSession | null,
    options: WatchdogOptions = {}
  ) {
    const now = options.now ?? (() => Date.now());
    const t = now();

    this.recoveryManager = recoveryManager;
    this.getActiveSession = getActiveSession;
    this.options = {
      checkIntervalMs: options.checkIntervalMs ?? DEFAULTS.checkIntervalMs,
      firstTokenTimeoutMs: options.firstTokenTimeoutMs ?? DEFAULTS.firstTokenTimeoutMs,
      stallTimeoutMs: options.stallTimeoutMs ?? DEFAULTS.stallTimeoutMs,
      idleSilenceReportMs: options.idleSilenceReportMs ?? DEFAULTS.idleSilenceReportMs,
      onFailureDetected: options.onFailureDetected ?? (() => {}),
      onClassificationChanged: options.onClassificationChanged ?? (() => {}),
      onLog: options.onLog ?? ((m) => console.log(m)),
      now,
    };

    // CRITICAL: every timestamp starts at "now", never at 0. A zero timestamp makes
    // the very first evaluation see a ~55-year gap and declare the connection dead.
    this.metrics = {
      sessionId,
      connectionId,
      connectionGeneration,
      startedAt: t,
      rebindCount: 0,
      lastProviderEventAt: t,
      lastAudioReceivedAt: t,
      lastTranscriptAt: t,
      lastOutboundAudioAt: t,
      lastOperationSuccessAt: t,
      turnOpen: false,
      turnOpenedAt: 0,
      playbackPending: 0,
      stage: 'LISTENING',
      lastClassification: 'HEALTHY',
    };
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer = setInterval(() => this.evaluateHealth(), this.options.checkIntervalMs);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Rebinds to a new authoritative connection. Resets all activity timestamps so the
   * fresh connection is never judged against the previous connection's history, and
   * never stops the watchdog.
   */
  public updateConnection(connectionId: string, connectionGeneration: number): void {
    const now = this.options.now();
    const changed = connectionId !== this.metrics.connectionId || connectionGeneration !== this.metrics.connectionGeneration;
    this.metrics.connectionId = connectionId;
    this.metrics.connectionGeneration = connectionGeneration;
    this.metrics.lastProviderEventAt = now;
    this.metrics.lastAudioReceivedAt = now;
    this.metrics.lastTranscriptAt = now;
    this.metrics.lastOutboundAudioAt = now;
    this.metrics.lastOperationSuccessAt = now;
    this.metrics.turnOpen = false;
    this.metrics.turnOpenedAt = 0;
    this.metrics.playbackPending = 0;
    this.metrics.stage = 'LISTENING';
    this.reportedFailureFor = null;
    if (changed) {
      this.metrics.rebindCount += 1;
      this.options.onLog(
        `[Watchdog] Rebound to ${connectionId} (Gen ${connectionGeneration}); ` +
          `timelines reset, watchdog remains armed.`
      );
    }
  }

  // ───────────────────────────── activity signals ─────────────────────────────

  public setStage(stage: ConversationalActivityStage): void {
    this.metrics.stage = stage;
  }

  public getStage(): ConversationalActivityStage {
    return this.metrics.stage;
  }

  /** Caller audio reached the relay. Opens a turn if none is open. */
  public recordAudioSent(): void {
    const now = this.options.now();
    this.metrics.lastOutboundAudioAt = now;
    this.metrics.lastProviderEventAt = Math.max(this.metrics.lastProviderEventAt, now);
  }

  /** Caller speech detected (VAD or transcription): we are now expecting a model turn. */
  public beginTurn(reason = 'caller speech'): void {
    const now = this.options.now();
    if (!this.metrics.turnOpen) {
      this.metrics.turnOpen = true;
      this.metrics.turnOpenedAt = now;
    }
    // A new turn is a new opportunity for the model: allow a fresh report if it stalls
    // again. RecoveryAuthority still coalesces this with any in-flight recovery.
    this.reportedFailureFor = null;
    this.metrics.stage = 'AWAITING_FIRST_TOKEN';
  }

  /**
   * The model has stopped producing. Ends the turn from the watchdog's point of view.
   * Playback may still be draining; that is a LOCAL condition and must never be treated
   * as provider silence.
   */
  public endTurn(reason = 'model turn complete'): void {
    this.metrics.turnOpen = false;
    this.metrics.turnOpenedAt = 0;
    this.metrics.stage = this.metrics.playbackPending > 0 ? 'DRAINING_PLAYBACK' : 'LISTENING';
    this.options.onLog(
      `[Watchdog] Turn closed (${reason}). Playback pending: ${this.metrics.playbackPending} chunk(s).`
    );
  }

  /** Model audio chunk arrived. Strongest liveness signal. */
  public recordAudioReceived(): void {
    const now = this.options.now();
    this.metrics.lastAudioReceivedAt = now;
    this.metrics.lastProviderEventAt = now;
    if (this.metrics.stage === 'AWAITING_FIRST_TOKEN' || this.metrics.stage === 'LISTENING') {
      this.metrics.stage = 'SPEAKING';
    }
    this.reportedFailureFor = null;
  }

  /** Any provider frame: audio, transcript, interruption, resumption, status. */
  public recordProviderEvent(kind = 'event'): void {
    const now = this.options.now();
    this.metrics.lastProviderEventAt = now;
    if (kind === 'transcript') {
      this.metrics.lastTranscriptAt = now;
    }
    this.reportedFailureFor = null;
  }

  /** Backwards-compatible alias used by existing call sites. */
  public recordGeminiEvent(): void {
    this.recordProviderEvent('event');
  }

  public recordOperationSuccess(): void {
    const now = this.options.now();
    this.metrics.lastOperationSuccessAt = now;
    this.metrics.lastProviderEventAt = now;
  }

  public setPlaybackPending(pending: number): void {
    this.metrics.playbackPending = pending;
    if (pending === 0 && !this.metrics.turnOpen) {
      this.metrics.stage = 'LISTENING';
    }
  }

  // ───────────────────────────── health evaluation ─────────────────────────────

  public evaluateHealth(): WatchdogHealthClassification {
    const active = this.getActiveSession();
    if (!active) {
      this.stop();
      return this.classify('DEAD', 'no active session');
    }

    const status = active.status || active.context.status;
    if (status === 'ENDING' || status === 'ENDED') {
      this.stop();
      return this.classify('DEAD', 'session ended');
    }

    // Guard 1: recovery already owns the connection. Never stack failures.
    if (status === 'RECOVERING' || status === 'RECONNECTING' || this.metrics.stage === 'RECOVERING') {
      this.reportedFailureFor = null;
      return this.classify('HEALTHY', 'recovery in progress');
    }

    // Guard 2: we are monitoring a superseded ticket. Do NOT self-destruct; rebind
    // as soon as the authority promotes a new one.
    const activeConnId = active.transport?.connectionId;
    const activeGen = active.transport?.connectionGeneration ?? active.transport?.generation;
    if (activeConnId && activeConnId !== this.metrics.connectionId) {
      return this.classify('DEGRADED', `awaiting rebind onto ${activeConnId}`);
    }
    if (activeGen !== undefined && activeGen !== this.metrics.connectionGeneration) {
      return this.classify('DEGRADED', `awaiting rebind onto generation ${activeGen}`);
    }

    const now = this.options.now();
    const { providerGap, turnAge, firstByteAge } = this.computeAges(now);

    // Guard 3: caller silence with no open turn is a NORMAL state, not a fault.
    if (!this.metrics.turnOpen) {
      return this.classify('HEALTHY', 'no open turn');
    }

    // Guard 4: the model finished sending and we are only draining local audio.
    if (this.metrics.stage === 'DRAINING_PLAYBACK') {
      return this.classify('HEALTHY', 'draining local playback buffer');
    }

    // Signal A: any provider activity.
    if (providerGap > this.options.stallTimeoutMs) {
      return this.reportFailure(
        'STALLED',
        `No provider activity for ${providerGap}ms while a model turn was open ` +
          `(stage=${this.metrics.stage}, turnAge=${turnAge}ms)`,
        'provider-silence'
      );
    }

    // Signal B: we opened a turn and the model never produced a single byte.
    if (this.metrics.stage === 'AWAITING_FIRST_TOKEN' && firstByteAge > this.options.firstTokenTimeoutMs) {
      return this.reportFailure(
        'STALLED',
        `Model produced no output for ${firstByteAge}ms after caller speech ` +
          `(firstTokenTimeout=${this.options.firstTokenTimeoutMs}ms)`,
        'no-first-byte'
      );
    }

    // Degraded: approaching a threshold but still inside tolerance.
    if (
      providerGap > this.options.stallTimeoutMs * 0.6 ||
      (this.metrics.stage === 'AWAITING_FIRST_TOKEN' && firstByteAge > this.options.firstTokenTimeoutMs * 0.6)
    ) {
      return this.classify('DEGRADED', `providerGap=${providerGap}ms firstByteAge=${firstByteAge}ms`);
    }

    return this.classify('HEALTHY', `providerGap=${providerGap}ms turnAge=${turnAge}ms`);
  }

  private computeAges(now: number): { providerGap: number; turnAge: number; firstByteAge: number } {
    const providerGap = now - this.metrics.lastProviderEventAt;
    const turnAge = this.metrics.turnOpen ? now - this.metrics.turnOpenedAt : 0;
    // Age since the model last produced AUDIO specifically, used only as a secondary
    // signal alongside providerGap — never on its own.
    const firstByteAge = now - Math.max(this.metrics.lastAudioReceivedAt, this.metrics.turnOpenedAt);
    return { providerGap, turnAge, firstByteAge };
  }

  private classify(classification: WatchdogHealthClassification, detail: string): WatchdogHealthClassification {
    if (classification !== this.metrics.lastClassification) {
      this.metrics.lastClassification = classification;
      this.options.onClassificationChanged(classification);
      this.options.onLog(
        `[Watchdog] Health -> ${classification} (${detail}) [conn=${this.metrics.connectionId} gen=${this.metrics.connectionGeneration}]`
      );
    }
    return classification;
  }

  /**
   * Reports to the Recovery Authority at most once per distinct stall.
   * Never calls connect() itself.
   *
   * `kind` MUST be a stable identifier. The human-readable `reason` embeds live timing
   * values, so keying deduplication on it would produce a fresh "fingerprint" on every
   * tick and re-report the same stall indefinitely, inflating the retry counter until
   * recovery exhausts. A genuine new stall is signalled by a provider event, a new turn,
   * or a connection rebind, all of which clear `reportedFailureFor`.
   */
  private reportFailure(
    classification: WatchdogHealthClassification,
    reason: string,
    kind: string
  ): WatchdogHealthClassification {
    const fingerprint = `${this.metrics.connectionId}:${kind}`;
    if (this.reportedFailureFor === fingerprint) {
      // Already reported this exact stall; do not re-report on every tick.
      return classification;
    }
    this.reportedFailureFor = fingerprint;
    this.metrics.lastFailureReason = reason;

    const active = this.getActiveSession();
    if (!active) return classification;

    this.options.onFailureDetected(reason, classification);
    this.options.onLog(
      `[Watchdog] Reporting to RecoveryAuthority: "${reason}" ` +
        `(session=${this.metrics.sessionId}, conn=${this.metrics.connectionId}, gen=${this.metrics.connectionGeneration})`
    );
    this.recoveryManager.reportFailure(active, 'WATCHDOG', reason);
    return classification;
  }

  public getMetrics(): WatchdogMetrics {
    return { ...this.metrics };
  }
}
