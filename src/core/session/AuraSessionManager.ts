import {
  AuraSession,
  AuraSessionStatus,
  AuraLifecycleEvent,
  GeminiConnection,
  GeminiConnectionStatus,
  GeminiTransportEvent,
  IndustryPreset,
  EndReason,
  AURA_STATE_TRANSITIONS,
  GEMINI_TRANSPORT_TRANSITIONS,
} from '../../types';
import { INITIAL_CONVERSATION_STATE } from '../conversation/ConversationState';

/**
 * SECTION 03: Authoritative AURA Session State Machine
 *
 * Core Architectural Invariant:
 * There is exactly ONE authoritative owner of the AURA session lifecycle: AuraSessionManager.
 *
 * - UI, WebSocket handlers, Gemini callbacks, RecoveryManager, and Audio Controllers
 *   may only REQUEST lifecycle transitions; they never mutate session state directly.
 * - Every lifecycle transition is explicit, serialized, logged, and validated against
 *   strict transition tables.
 * - Illegal transitions (e.g. ENDED -> ENDING, CLOSED -> CLOSING, ACTIVE -> STARTING)
 *   are rejected rather than silently executed.
 * - RECOVERING is NOT ENDING: Upstream connection disconnects leave the customer's
 *   AURA session alive while the transport recovers seamlessly.
 */
export class AuraSessionManager {
  /**
   * Dispatches an explicit lifecycle event to the AURA session.
   * Returns true if the transition succeeded or was an idempotent no-op; false if rejected.
   */
  public static transition(
    session: AuraSession,
    event: AuraLifecycleEvent,
    reason: string
  ): boolean {
    const currentStatus = session.status || session.context.status || 'IDLE';
    const transitionRule = AURA_STATE_TRANSITIONS[currentStatus];

    if (!transitionRule || !(event in transitionRule)) {
      console.warn(
        `[SessionLifecycle Warning] Rejected illegal transition: session=${session.sessionId} event=${event} from=${currentStatus} (Reason: ${reason})`
      );
      return false;
    }

    const nextStatus = transitionRule[event] as AuraSessionStatus;

    // Idempotent no-op
    if (nextStatus === currentStatus) {
      console.log(
        `[SessionLifecycle] Idempotent transition: session=${session.sessionId} event=${event} status remains ${currentStatus}`
      );
      return true;
    }

    const now = Date.now();
    console.log(
      `[SessionLifecycle] session=${session.sessionId} event=${event} from=${currentStatus} to=${nextStatus} generation=${session.generation || session.context.generation} reason="${reason}"`
    );

    // Apply state change
    session.status = nextStatus;
    session.context.status = nextStatus;
    session.lastActivityAt = now;

    // Record lifecycle transition audit entry
    if (session.lifecycle) {
      session.lifecycle.lastEvent = event;
      session.lifecycle.lastEventReason = reason;
      session.lifecycle.transitionHistory.push({
        event,
        from: currentStatus,
        to: nextStatus,
        reason,
        timestamp: now,
        generation: session.generation || session.context.generation,
      });

      if (nextStatus === 'ENDED') {
        session.lifecycle.endedAt = now;
      }
    }

    return true;
  }

  /**
   * Dispatches an explicit transport lifecycle event to the Gemini connection.
   */
  public static transitionTransport(
    session: AuraSession,
    event: GeminiTransportEvent,
    reason: string
  ): boolean {
    const transport = session.transport;
    const currentStatus = transport.status;
    const transitionRule = GEMINI_TRANSPORT_TRANSITIONS[currentStatus];

    if (!transitionRule || !(event in transitionRule)) {
      console.warn(
        `[TransportLifecycle Warning] Rejected illegal transport transition: connection=${transport.connectionId} event=${event} from=${currentStatus} (Reason: ${reason})`
      );
      return false;
    }

    const nextStatus = transitionRule[event] as GeminiConnectionStatus;

    // Idempotent no-op
    if (nextStatus === currentStatus) {
      return true;
    }

    const now = Date.now();
    console.log(
      `[TransportLifecycle] connection=${transport.connectionId} event=${event} from=${currentStatus} to=${nextStatus} reason="${reason}"`
    );

    transport.status = nextStatus;

    if (nextStatus === 'CONNECTED') {
      transport.connectedAt = now;
      transport.lastConnectedAt = now;
      transport.recoveryStatus = transport.generation && transport.generation > 1 ? 'SUCCEEDED' : 'NONE';
    } else if (nextStatus === 'CLOSED') {
      transport.disconnectedAt = now;
      transport.lastDisconnectedAt = now;
    }

    return true;
  }

  /**
   * Creates a brand new AURA Session for a customer call.
   */
  public static createSession(
    persona: IndustryPreset,
    generation: number,
    existingFacts: any[] = []
  ): AuraSession {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    const session: AuraSession = {
      sessionId,
      personaId: persona.id,
      persona,
      status: 'STARTING',
      generation,
      createdAt: now,
      lastActivityAt: now,
      activeConnectionId: null,
      connectionGeneration: 0,
      transport: {
        connectionId: 'conn_pending',
        sessionId,
        generation: 0,
        connectionGeneration: 0,
        status: 'DISCONNECTED',
        model: 'gemini-3.8-live',
        voice: 'Kore',
        reconnectAttempt: 0,
        recoveryStatus: 'NONE',
        closeReason: 'UNKNOWN',
        createdAt: now,
        connectedAt: null,
        disconnectedAt: null,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        resumption: {
          handle: null,
          issuedAt: null,
          lastUpdatedAt: null,
          expiresAt: null,
          resumable: false,
        },
      },
      audio: {
        input: 'UNKNOWN',
        output: 'READY',
      },
      greeting: 'PENDING',
      memory: {
        sessionId,
        personaId: persona.id,
        messages: [],
        facts: existingFacts,
      },
      runtimeState: {
        ...INITIAL_CONVERSATION_STATE,
      },
      context: {
        sessionId,
        personaId: persona.id,
        createdAt: now,
        status: 'STARTING',
        generation,
      },
      lifecycle: {
        generation,
        transitionId: `trans_${Date.now()}`,
        startedAt: now,
        transitionHistory: [
          {
            event: 'START_REQUEST',
            from: 'IDLE',
            to: 'STARTING',
            reason: 'Session created for customer call',
            timestamp: now,
            generation,
          },
        ],
      },
    };

    return session;
  }

  /**
   * Creates a new GeminiConnection linked to an existing AURA Session.
   */
  public static createConnection(
    session: AuraSession,
    connectionGeneration: number,
    voiceName = 'Kore',
    model = 'gemini-3.8-live',
    explicitConnectionId?: string
  ): GeminiConnection {
    // When an explicit id is supplied it MUST come from the Connection Authority.
    // Generating an id here is what allowed two authorities to mint two different
    // connections for the same generation.
    const connectionId =
      explicitConnectionId || `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();

    return {
      connectionId,
      sessionId: session.sessionId || session.context.sessionId,
      generation: connectionGeneration,
      connectionGeneration,
      status: 'CONNECTING',
      model,
      voice: voiceName,
      reconnectAttempt: session.transport?.reconnectAttempt || 0,
      recoveryStatus: connectionGeneration > 1 ? 'CONNECTING' : 'NONE',
      closeReason: 'UNKNOWN',
      createdAt: now,
      connectedAt: null,
      disconnectedAt: null,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      resumption: session.transport?.resumption ? { ...session.transport.resumption } : {
        handle: null,
        issuedAt: null,
        lastUpdatedAt: null,
        expiresAt: null,
        resumable: false,
      },
    };
  }

  /**
   * Attaches a GeminiConnection to the AURA Session and moves transport to CONNECTING.
   */
  public static attachConnection(
    session: AuraSession,
    connection: GeminiConnection
  ): AuraSession {
    session.activeConnectionId = connection.connectionId;
    session.connectionGeneration = connection.generation ?? 1;
    session.transport = connection;
    session.lastActivityAt = Date.now();

    AuraSessionManager.transitionTransport(session, 'CONNECT_REQUEST', 'WebSocket connection in flight');
    return session;
  }

  /**
   * Marks the GeminiConnection as connected and moves AURA Session to ACTIVE.
   */
  public static markConnected(
    session: AuraSession,
    connectionId: string,
    connectionGen: number
  ): AuraSession {
    if (session.transport.connectionId === connectionId) {
      AuraSessionManager.transitionTransport(session, 'CONNECT_SUCCESS', 'WebSocket open & verified');
    }

    const currentStatus = session.status || session.context.status;
    if (currentStatus === 'RECOVERING' || currentStatus === 'RECONNECTING') {
      AuraSessionManager.transition(session, 'RECOVERY_SUCCESS', 'Gemini replacement connection established');
    } else {
      AuraSessionManager.transition(session, 'START_SUCCESS', 'Gemini Live initial handshake verified');
    }

    session.lastActivityAt = Date.now();
    return session;
  }

  /**
   * F-11: records that the caller has already heard the greeting.
   *
   * The server is the authority on this, because it is the only party that survives a page
   * refresh. When it reports that a call is resuming, the client would otherwise reset its
   * greeting state for the new connection and the agent would re-introduce itself mid-call.
   * Setting the flag to `DELIVERED` here is what keeps a recovered call from restarting.
   *
   * Idempotent by design: being told twice must not throw or double-count.
   */
  public static markGreetingDelivered(session: AuraSession | null): void {
    if (!session) return;
    session.greeting = 'DELIVERED';
  }

  /** True when the caller has already heard the greeting for this call. */
  public static hasGreeted(session: AuraSession | null): boolean {
    return session?.greeting === 'DELIVERED';
  }

  /**
   * Handles Gemini connection failure.
   * INVARIANT: The AURA Session does NOT die. It transitions to RECOVERING.
   * Persona, conversation state, memory facts, and transcripts are strictly preserved.
   */
  public static handleConnectionFailure(
    session: AuraSession,
    connectionId: string,
    reason: string
  ): AuraSession {
    if (session.transport.connectionId === connectionId) {
      AuraSessionManager.transitionTransport(session, 'DISCONNECT', reason);
    }

    // AURA Session transitions to RECOVERING (NOT ENDED)
    AuraSessionManager.transition(session, 'GEMINI_FAILURE', reason);
    return session;
  }

  /**
   * Handles recovery completion success.
   */
  public static handleRecoverySuccess(
    session: AuraSession,
    connectionId: string,
    connectionGen: number
  ): AuraSession {
    return AuraSessionManager.markConnected(session, connectionId, connectionGen);
  }

  /**
   * Handles recovery exhaustion or fatal recovery failure.
   */
  public static handleRecoveryFailed(
    session: AuraSession,
    reason: string
  ): AuraSession {
    AuraSessionManager.transition(session, 'RECOVERY_FAILED', reason);
    return session;
  }

  /**
   * Terminates the entire AURA Session on intentional boundary (USER_ENDED, TIME_LIMIT, PERSONA_SWITCH).
   */
  public static endSession(
    session: AuraSession,
    reason: EndReason = 'USER_ENDED'
  ): AuraSession {
    session.endReason = reason;
    session.context.endReason = reason;

    if (session.lifecycle) {
      session.lifecycle.endReason = reason;
    }

    // Step 1: Transition AURA Session to ENDING
    const event: AuraLifecycleEvent = reason === 'PERSONA_SWITCH' ? 'PERSONA_SWITCH' : 'USER_END';
    AuraSessionManager.transition(session, event, `Session ending: ${reason}`);

    // Step 2: Transition Transport to CLOSING then CLOSED
    if (session.transport.status !== 'CLOSED') {
      AuraSessionManager.transitionTransport(session, 'CLOSE_REQUEST', reason);
      if (session.transport.status === 'CLOSING') {
        AuraSessionManager.transitionTransport(session, 'CLOSE_COMPLETE', reason);
      }
    }

    // Step 3: Transition AURA Session to ENDED
    AuraSessionManager.transition(session, 'END_COMPLETE', 'Session teardown finalized');

    return session;
  }

  private static activeStartPromise: Promise<AuraSession> | null = null;
  private static activeStartOpId: string | null = null;
  private static activeEndPromise: Promise<void> | null = null;
  private static activeEndOpId: string | null = null;
  private static activeRecoveryPromise: Promise<boolean> | null = null;

  /**
   * Idempotent Start Execution (Section 04):
   * Serializes session starts. Multiple parallel start requests join the same in-flight start promise.
   * If an active session already exists and is active, returns it immediately without creating duplicates.
   */
  public static async executeStart(
    persona: IndustryPreset,
    activeSession: AuraSession | null,
    startFn: (opId: string) => Promise<AuraSession>
  ): Promise<AuraSession> {
    // 1. If a start is already in progress, join it
    if (AuraSessionManager.activeStartPromise) {
      console.log(`[SessionLifecycle] START_ALREADY_IN_PROGRESS: Joining existing start operation ${AuraSessionManager.activeStartOpId}`);
      return AuraSessionManager.activeStartPromise;
    }

    // 2. If an end is currently in progress, wait for it to complete
    if (AuraSessionManager.activeEndPromise) {
      console.log(`[SessionLifecycle] Waiting for active end operation ${AuraSessionManager.activeEndOpId} before starting new session...`);
      try {
        await AuraSessionManager.activeEndPromise;
      } catch (_) {}
    }

    // 3. If an existing session is already active or recovering, no-op
    if (activeSession && AuraSessionManager.isSessionActive(activeSession)) {
      console.log(`[SessionLifecycle] Active session ${activeSession.sessionId} already exists. Ignoring start request.`);
      return activeSession;
    }

    const opId = `op_start_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    AuraSessionManager.activeStartOpId = opId;
    console.log(`[SessionLifecycle] Starting new session operation ${opId} for persona "${persona.businessName}"`);

    AuraSessionManager.activeStartPromise = (async () => {
      try {
        return await startFn(opId);
      } finally {
        AuraSessionManager.activeStartPromise = null;
        AuraSessionManager.activeStartOpId = null;
      }
    })();

    return AuraSessionManager.activeStartPromise;
  }

  /**
   * Idempotent End Execution (Section 04):
   * Serializes session termination. Multiple parallel end requests join the same in-flight shutdown promise.
   */
  public static async executeEnd(
    session: AuraSession | null,
    reason: EndReason,
    endFn: (opId: string) => Promise<void>
  ): Promise<void> {
    // 1. If an end is already in progress, join it
    if (AuraSessionManager.activeEndPromise) {
      console.log(`[SessionLifecycle] END_ALREADY_IN_PROGRESS: Joining existing end operation ${AuraSessionManager.activeEndOpId}`);
      return AuraSessionManager.activeEndPromise;
    }

    // 2. If session is already ended or null, no-op
    if (!session || session.status === 'ENDED' || session.context.status === 'ENDED') {
      console.log(`[SessionLifecycle] Session is already ended or null. Ignoring end request.`);
      return;
    }

    const opId = `op_end_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    AuraSessionManager.activeEndOpId = opId;
    console.log(`[SessionLifecycle] Initiating shutdown operation ${opId} (Session: ${session.sessionId}, Reason: ${reason})`);

    AuraSessionManager.activeEndPromise = (async () => {
      try {
        await endFn(opId);
      } finally {
        AuraSessionManager.activeEndPromise = null;
        AuraSessionManager.activeEndOpId = null;
      }
    })();

    return AuraSessionManager.activeEndPromise;
  }

  /**
   * Idempotent Recovery Execution (Section 04):
   * Joins any in-flight recovery promise to prevent duplicate recovery runs.
   */
  public static async executeRecovery(
    session: AuraSession | null,
    recoveryFn: () => Promise<boolean>
  ): Promise<boolean> {
    if (!session || !AuraSessionManager.canRecover(session)) {
      console.warn(`[RecoveryLifecycle] Recovery rejected: session is not in recoverable state.`);
      return false;
    }

    if (AuraSessionManager.activeRecoveryPromise) {
      console.log(`[RecoveryLifecycle] RECOVERY_ALREADY_IN_PROGRESS: Joining existing recovery operation.`);
      return AuraSessionManager.activeRecoveryPromise;
    }

    AuraSessionManager.activeRecoveryPromise = (async () => {
      try {
        return await recoveryFn();
      } finally {
        AuraSessionManager.activeRecoveryPromise = null;
      }
    })();

    return AuraSessionManager.activeRecoveryPromise;
  }

  /**
   * Validates if a session is currently active.
   */
  public static isSessionActive(session: AuraSession | null): boolean {
    if (!session) return false;
    const status = session.status || session.context.status;
    return status !== 'ENDED' && status !== 'ENDING';
  }

  /**
   * Validates if a session can accept a recovery attempt.
   */
  public static canRecover(session: AuraSession | null): boolean {
    if (!session) return false;
    const status = session.status || session.context.status;
    return status === 'ACTIVE' || status === 'RECOVERING' || status === 'CONNECTED' || status === 'RECONNECTING';
  }

  /**
   * SECTION 07: Updates provider-side Gemini session resumption state.
   * Attached strictly to the disposable Gemini connection metadata, NOT customer memory.
   */
  public static updateResumptionState(
    session: AuraSession,
    connectionId: string,
    handle: string | null,
    resumable: boolean,
    ttlMs = 300000 // 5 minutes standard bounded validity
  ): void {
    if (!session.transport) return;

    // Verify callback matches the transport
    if (session.transport.connectionId && session.transport.connectionId !== connectionId) {
      console.warn(
        `[Resumption Warning] Stale resumption token ignored: connectionId=${connectionId} active=${session.transport.connectionId}`
      );
      return;
    }

    const now = Date.now();
    const prevHandle = session.transport.resumption?.handle ?? null;
    const finalHandle = resumable && handle ? handle : prevHandle;

    session.transport.resumption = {
      handle: finalHandle,
      issuedAt: session.transport.resumption?.issuedAt || now,
      lastUpdatedAt: now,
      expiresAt: now + ttlMs,
      resumable,
    };

    console.log(
      `[Resumption] Updated state: session=${session.sessionId} connection=${connectionId} resumable=${resumable} handle=${
        finalHandle ? finalHandle.substring(0, 8) + '...' : 'none'
      }`
    );
  }

  /**
   * Evaluates whether the current Gemini connection is eligible for session resumption.
   */
  public static isResumptionEligible(session: AuraSession | null): boolean {
    if (!session || !session.transport || !session.transport.resumption) return false;
    const r = session.transport.resumption;
    const notExpired = r.expiresAt ? Date.now() < r.expiresAt : false;
    return Boolean(r.resumable && r.handle && notExpired);
  }

  /**
   * Clears the disposable resumption handle (e.g. on invalidation, terminal failure, or intentional end).
   */
  public static clearResumption(session: AuraSession): void {
    if (session.transport) {
      session.transport.resumption = {
        handle: null,
        issuedAt: null,
        lastUpdatedAt: null,
        expiresAt: null,
        resumable: false,
      };
    }
  }

  /**
   * Returns canonical recovery continuation prompt constraint (Section 07.24).
   * Strict behavioral boundary: No re-greeting, no memory wipe, authoritative runtime state.
   */
  public static getRecoveryContinuationInstruction(): string {
    return [
      `[RECOVERY CONTINUATION INSTRUCTION]`,
      `CRITICAL INSTRUCTION: You are continuing an existing live conversation with this customer.`,
      `- DO NOT introduce yourself or say "Hello / Welcome to..." again.`,
      `- DO NOT restart the conversation or ask for information that has already been confirmed.`,
      `- Continue naturally and seamlessly from the current conversation state and next required step.`,
      `- The AURA runtime state is authoritative.`,
    ].join('\n');
  }
}
