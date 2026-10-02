import { useState, useRef, useCallback, useEffect } from 'react';
import {
  AgentStatus,
  SessionStatus,
  TransportStatus,
  AudioState,
  EndReason,
  GreetingState,
  TranscriptItem,
  SessionContext,
  ActiveSession,
  AuraSession,
  isSessionActive,
  transitionSessionStatus,
  transitionTransportStatus,
  VoiceOption,
  AVAILABLE_VOICES,
  INDUSTRY_PRESETS,
  IndustryPreset,
} from '../types';
import { RecoveryManager, ConnectionGuard } from '../core/recovery';
import { OutboundPromptQueue } from '../core/recovery/OutboundPromptQueue';
import { AuraSessionManager } from '../core/session/AuraSessionManager';
import { ConnectionAuthority, ConnectionTicket } from '../core/connection/ConnectionAuthority';
import {
  ConversationMachine,
  ConversationRuntimeState,
  INITIAL_CONVERSATION_STATE,
  ConversationEvent,
} from '../core/conversation';
import {
  TranscriptStore,
  MemoryManager,
  ContextBuilder,
  StructuredMemoryState,
  SessionFact,
} from '../core/memory';
// Deliberately NOT importing the `../tools` barrel here. That barrel re-exports the whole
// server-side booking stack, which reaches `fs` and `path` through JournalFile and
// AppointmentStore. Because `rolldown-vite` externalizes those for the browser, the client build
// shipped a booking implementation that could not possibly work in a browser, and printed a
// build warning naming the exact files - a bundle-size and correctness liability that was only
// visible because the dead `executeAuthoritativeAction` helper existed. The server is the sole
// tool authority (`server.ts` imports `./src/tools/ToolGateway` directly), so the browser has
// no legitimate reason to link the tool stack at all.
import { GeminiWatchdog, WatchdogHealthClassification } from '../core/watchdog/GeminiWatchdog';
import { GoAwayRenewalManager } from '../core/renewal/GoAwayRenewalManager';
import {
  getOutputAudioContext,
  calculateAudioLevel,
  closeAudioContexts,
} from '../utils/audioUtils';
import { extractSessionFactsFromText } from '../utils/transcriptUtils';
import { useMicrophoneCapture } from './useMicrophoneCapture';
import { useAudioPlayback } from './useAudioPlayback';
import { useSessionMemoryControls } from './useSessionMemoryControls';
import { useSilenceLadder } from './useSilenceLadder';
import { useRelayTransport } from './useRelayTransport';

const STORAGE_KEY_LOCKED_PERSONA = 'aura_locked_persona_id_v3';

/** How long a replacement socket has to hand us a verified `status: connected`. */

const INITIAL_FACTS: SessionFact[] = [
  {
    id: 'fact_1',
    category: 'preference',
    content: 'User prefers concise, direct, articulate answers in American English with zero fluff.',
    source: 'SYSTEM',
    timestamp: Date.now(),
  },
  {
    id: 'fact_2',
    category: 'fact',
    content: 'AURA voice agent powered by the Gemini Live API with real-time persistent session memory.',
    source: 'SYSTEM',
    timestamp: Date.now(),
  },
  {
    id: 'fact_3',
    category: 'protocol',
    content: 'Dynamic Name Timing: Discuss requested service and availability naturally first; ask for caller name when reserving or confirming the slot.',
    source: 'SYSTEM',
    timestamp: Date.now(),
  },
  {
    id: 'fact_4',
    category: 'protocol',
    content: 'Email Spell-Back Rule (Zero Mistakes): Always ask for caller email (not phone) and spell it out letter-by-letter out loud to confirm accuracy.',
    source: 'SYSTEM',
    timestamp: Date.now(),
  },
  {
    id: 'fact_5',
    category: 'protocol',
    content: 'Upselling Rule: Always ask "Is there any other service or assistance you need today?" after confirming booking details.',
    source: 'SYSTEM',
    timestamp: Date.now(),
  },
];

// F-28: these are instructions the agent operates under, not things the caller said.
// `MemoryManager` protects them from deletion and re-asserts them after a reset, so the
// inspector's "delete" and "reset memory" controls cannot take the agent out of policy.

/**
 * SECTION 13: obtains the relay cookie before the socket is opened.
 *
 * A browser cannot attach a custom header to a WebSocket handshake, so when the server has
 * AURA_LIVE_TOKEN configured it expects the secret in an HttpOnly cookie. This calls the
 * same-origin bootstrap endpoint, which sets that cookie; the browser then attaches it to
 * the upgrade automatically and the secret never passes through page JavaScript or a URL.
 *
 * When no token is configured the endpoint replies `{ configured: false }` and the socket
 * opens on the strength of the same-origin check alone, which is a supported mode.
 *
 * Failure here is deliberately non-fatal. If the bootstrap is unreachable the socket is
 * still attempted, so a transient network blip does not become a hard failure; the server
 * then answers 401 and the normal reconnect path takes over with its own backoff.
 */

export function useVoiceAgent() {
  // Authoritative Session & Transport State Machine
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('IDLE');
  const [transportStatus, setTransportStatus] = useState<TransportStatus>('DISCONNECTED');
  const [audioState, setAudioState] = useState<AudioState>({ input: 'UNKNOWN', output: 'READY' });
  const [greetingState, setGreetingState] = useState<GreetingState>('PENDING');

  // Authoritative Active Session Reference & Monotonic Generation Counter
  const activeSessionRef = useRef<ActiveSession | null>(null);
  const generationRef = useRef<number>(0);
  const isStartingRef = useRef<boolean>(false);

  // Layer 1: Raw Transcript Store
  const transcriptStoreRef = useRef<TranscriptStore>(new TranscriptStore('sess_init', 'aura-salon'));
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);

  // Layer 2: Structured Memory Manager
  const memoryManagerRef = useRef<MemoryManager>(new MemoryManager('sess_init', 'aura-salon', undefined, INITIAL_FACTS));
  const [memoryState, setMemoryState] = useState<StructuredMemoryState>(memoryManagerRef.current.getState());

  // Layer 3: Conversation Runtime State Machine
  const conversationMachineRef = useRef<ConversationMachine>(new ConversationMachine());
  const [runtimeState, setRuntimeState] = useState<ConversationRuntimeState>(INITIAL_CONVERSATION_STATE);

  // Turns typed while the transport is recovering. Previously these were dropped with a
  // `[Outbound] Dropped text prompt` warning, so a caller who typed a question across an upstream
  // blip watched the agent come back and say nothing - the failure read as deafness rather than
  // as a dropped turn. Held here and flushed once the socket is genuinely verified.
  const pendingPromptsRef = useRef<OutboundPromptQueue>(new OutboundPromptQueue());

  useEffect(() => {
    const unsubscribe = conversationMachineRef.current.subscribe((newState) => {
      setRuntimeState(newState);
      if (activeSessionRef.current) {
        activeSessionRef.current.runtimeState = newState;
      }
      if (newState.entities.customerName?.value) {
        memoryManagerRef.current.updateCustomerMemory({ name: newState.entities.customerName.value });
      }
      if (newState.entities.email?.value) {
        memoryManagerRef.current.updateCustomerMemory({ email: newState.entities.email.value });
      }
      if (newState.entities.phone?.value) {
        memoryManagerRef.current.updateCustomerMemory({ phone: newState.entities.phone.value });
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = memoryManagerRef.current.subscribe((setNewMem) => setMemoryState(setNewMem));
    return unsubscribe;
  }, []);

  const [lockedPersonaId, setLockedPersonaId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_LOCKED_PERSONA);
    } catch {
      return null;
    }
  });

  const [currentPreset, setCurrentPreset] = useState<IndustryPreset>(() => {
    try {
      const savedLockedId = localStorage.getItem(STORAGE_KEY_LOCKED_PERSONA);
      if (savedLockedId) {
        const found = INDUSTRY_PRESETS.find((p) => p.id === savedLockedId);
        if (found) return found;
      }
    } catch (_) {}
    return INDUSTRY_PRESETS[0];
  });

  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(AVAILABLE_VOICES[0]);
  const [speechSpeedRate, setSpeechSpeedRate] = useState<number>(1.0);

  // 5-Minute Call Session Timer (300 seconds)
  const MAX_SESSION_SECONDS = 300;
  const [remainingSeconds, setRemainingSeconds] = useState<number>(MAX_SESSION_SECONDS);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingSecondsRef = useRef<number>(MAX_SESSION_SECONDS);

  // Smart Inactivity Silence Ladder

  /**
   * User-authored system instruction override.
   * Previously the Settings editor wrote to a `systemInstruction` state variable that was
   * shadowed by `const { systemInstruction } = ContextBuilder.buildContext(...)` inside
   * startSession/reconnect, so the edit was silently discarded. The override is now an
   * explicit nullable value that is only cleared on a persona boundary.
   */
  const [systemInstructionOverride, setSystemInstructionOverride] = useState<string | null>(null);

  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);

  // ─────────────────────────── References ───────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  // F-42: the mic stream, processor, source, analyser, sink and single-flight guard are owned by
  // `useMicrophoneCapture`. The playback queue, the single in-flight source and the analyser
  // are owned by `useAudioPlayback`.
  const animFrameRef = useRef<number | null>(null);
  /** Dedupe guard so a single socket fault is reported once. */
  const lastReportedFailureRef = useRef<string | null>(null);

  /**
   * SECTION 02: The Connection Authority.
   * A single instance lives for the whole hook. It is the ONLY component allowed to
   * allocate a connection generation or start a replacement connection.
   */
  const connectionAuthorityRef = useRef<ConnectionAuthority | null>(null);
  if (connectionAuthorityRef.current === null) {
    connectionAuthorityRef.current = new ConnectionAuthority();
  }
  const connectionAuthority = connectionAuthorityRef.current;

  /** Late-bound so the managers can be constructed before the reconnect implementation. */
  const reconnectRunnerRef = useRef<(ticket: ConnectionTicket, opId: string, mode: 'RESUME' | 'FRESH', handle: string | null) => Promise<boolean>>(
    async () => false
  );

  const recoveryManagerRef = useRef<RecoveryManager | null>(null);
  if (recoveryManagerRef.current === null) {
    recoveryManagerRef.current = new RecoveryManager({
      authority: connectionAuthority,
      onReconnectInitiated: (ticket, opId, mode, handle) => reconnectRunnerRef.current(ticket, opId, mode, handle),
      onRecoveryExhausted: (context, message) => {
        const active = activeSessionRef.current;
        if (active && isSessionActive(context, active.context)) {
          AuraSessionManager.handleRecoveryFailed(active, message);
          setTransportStatus('FAILED');
          setSessionStatus('FAILED');
          setApiError(message);
          void endSessionRef.current('NETWORK_FAILURE');
        }
      },
      onStatusChanged: (recStatus) => {
        if (activeSessionRef.current) {
          activeSessionRef.current.transport.recoveryStatus = recStatus;
        }
      },
    });
  }
  const recoveryManager = recoveryManagerRef.current;

  const goAwayRenewalManagerRef = useRef<GoAwayRenewalManager | null>(null);
  if (goAwayRenewalManagerRef.current === null) {
    goAwayRenewalManagerRef.current = new GoAwayRenewalManager(connectionAuthority);
  }
  const goAwayRenewalManager = goAwayRenewalManagerRef.current;

  const watchdogRef = useRef<GeminiWatchdog | null>(null);
  const endSessionRef = useRef<(reason?: EndReason) => Promise<void>>(async () => {});

  // ─────────────────────────── Derived status ───────────────────────────

  const status: AgentStatus = (() => {
    if (sessionStatus === 'IDLE' || sessionStatus === 'ENDED') return 'idle';
    if (sessionStatus === 'STARTING' || sessionStatus === 'CONNECTING' || transportStatus === 'CONNECTING') return 'connecting';
    if (sessionStatus === 'RECONNECTING' || sessionStatus === 'RECOVERING' || transportStatus === 'RECONNECTING') return 'connecting';
    if (sessionStatus === 'FAILED' || transportStatus === 'FAILED') return 'error';
    if (isMicMuted) return 'muted';
    if (isAgentSpeaking) return 'speaking';
    if (sessionStatus === 'CONNECTED' && transportStatus === 'CONNECTED') return 'listening';
    return 'connected';
  })();

  /**
   * Normal conversation turns are frozen while the transport is not healthy, so caller
   * audio and text prompts are never sent into a dying connection (and are not silently
   * lost either - the UI reflects the RECOVERING state).
   */
  const isTurnFrozen = useCallback((): boolean => {
    const active = activeSessionRef.current;
    if (!active) return true;
    const s = active.status || active.context.status;
    return s === 'RECOVERING' || s === 'RECONNECTING' || s === 'ENDING' || s === 'ENDED';
  }, []);

  // ─────────────────────────── Client session context ───────────────────────────

  /**
   * SECTION 12: The client no longer composes the system prompt.
   *
   * The base instruction, the business persona, and every price/hour/policy fact are
   * assembled server-side by `PromptAuthority` from the validated persona registry. The
   * browser only contributes two bounded, explicitly-fenced values: a conversation-memory
   * summary and an optional operator override. The client still builds the local compiled
   * context because the UI renders it and the session memory is sent as data.
   */
  const resolveClientSessionContext = useCallback(
    (isRecovery = false) => {
      const active = activeSessionRef.current;
      const persona = active?.persona ?? currentPreset;
      const { compiledContext } = ContextBuilder.buildContext(
        persona,
        conversationMachineRef.current.getState(),
        memoryManagerRef.current,
        transcriptStoreRef.current,
        8,
        isRecovery
      );
      return { compiledContext };
    },
    [currentPreset]
  );

  // ─────────────────────────── Silence ladder ───────────────────────────
  //
  // F-42: the escalating inactivity prompts, their thresholds, and the farewell grace period
  // now live in `useSilenceLadder`. This hook no longer owns *when* a caller is considered
  // gone, only the transport it uses to say so.

  const silenceLadder = useSilenceLadder({
    sendPrompt: (prompt) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;
      wsRef.current.send(JSON.stringify({ type: 'silence_check', prompt }));
      return true;
    },
    isTurnFrozen,
    getContext: () => activeSessionRef.current?.context ?? null,
    isSessionActive: (context) => isSessionActive(context, activeSessionRef.current?.context ?? null),
    endSession: (reason) => endSessionRef.current(reason as EndReason),
  });

  const resetSilenceTimer = useCallback(() => silenceLadder.reset(), [silenceLadder]);
  const scheduleSilenceTimer = useCallback(
    (context: SessionContext) => silenceLadder.schedule(context),
    [silenceLadder]
  );

  // Monitor real-time audio volume levels for visualizer
  useEffect(() => {
    let cancelled = false;
    const updateAudioLevel = () => {
      if (cancelled) return;
      const analyser = analyserRef.current || micAnalyserRef.current;
      if (analyser) {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        setAudioLevel(calculateAudioLevel(dataArray));
      } else {
        setAudioLevel(0);
      }
      animFrameRef.current = requestAnimationFrame(updateAudioLevel);
    };
    animFrameRef.current = requestAnimationFrame(updateAudioLevel);
    return () => {
      cancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Periodic heartbeat to keep WebSocket connection and intermediate proxies/NAT gateways alive
  useEffect(() => {
    const interval = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && transportStatus === 'CONNECTED') {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch (_) {}
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [transportStatus]);


  // ─────────────────────────── Playback ───────────────────────────
  //
  // F-42: the ordered output queue, the single in-flight source and the barge-in interrupt
  // now live in `useAudioPlayback`.

  const { queueAudioChunk, processPlaybackQueue, interruptPlayback, pausePlayback, isPlayingRef, analyserRef } = useAudioPlayback({
    activeSessionRef,
    isSessionStillActive: (context) => isSessionActive(context, activeSessionRef.current?.context ?? null),
    watchdog: {
      setPlaybackPending: (pending) => watchdogRef.current?.setPlaybackPending(pending),
      endTurn: (reason) => watchdogRef.current?.endTurn(reason),
    },
    clearSilenceTimer: resetSilenceTimer,
    onTurnEnded: (context) => {
      // The model has stopped producing and the buffer is empty: restart the silence ladder.
      scheduleSilenceTimer(context);
    },
    isAudioMuted,
    speechSpeedRate,
    setIsAgentSpeaking,
  });

  // Stop current agent speaking audio immediately
  const interruptAgent = useCallback(() => {
    interruptPlayback('caller interrupted playback');
  }, [interruptPlayback]);

  // ─────────────────────────── Microphone ───────────────────────────
  //
  // F-42: acquisition, the permission prompt, single-flight and echo suppression now live in
  // `useMicrophoneCapture`. They used to sit in this hook, next to transport and prompt code,
  // which meant a fix to any of the three had to be made next to the other two.

  const { startMicCapture, stopMicCapture, micAnalyserRef, hasLiveStream } = useMicrophoneCapture({
    isSessionStillActive: (context) => isSessionActive(context, activeSessionRef.current?.context ?? null),
    wsRef,
    isPlayingRef,
    publishMicAnalyser: (analyser) => {
      analyserRef.current = analyser;
    },
    isMicMuted,
    isTurnFrozen,
    onVoiceActivity: () => {
      resetSilenceTimer();
      // Caller speech: we now expect a model turn.
      watchdogRef.current?.beginTurn('caller voice activity');
    },
    onAudioSent: () => watchdogRef.current?.recordAudioSent(),
    setMicError,
    setAudioState,
  });

  // ─────────────────────────── Failure reporting ───────────────────────────

  /**
   * Collapses duplicate fault reports for the same underlying cause. A single dead
   * socket used to produce a `status: disconnected` report AND an `onclose` report,
   * which inflated the retry counter and made recovery look worse than it was.
   */
  const reportFailureOnce = useCallback(
    (source: 'GEMINI' | 'WEBSOCKET' | 'WATCHDOG' | 'MANUAL', reason: string, code?: number | string) => {
      const fingerprint = `${activeSessionRef.current?.context.sessionId ?? 'none'}:${source}:${reason}:${code ?? ''}`;
      if (lastReportedFailureRef.current === fingerprint) {
        return;
      }
      lastReportedFailureRef.current = fingerprint;
      const active = activeSessionRef.current;
      if (!active) return;
      recoveryManager.reportFailure(active, source, reason, code);
      // Allow a genuinely new fault after a short quiet period.
      setTimeout(() => {
        if (lastReportedFailureRef.current === fingerprint) {
          lastReportedFailureRef.current = null;
        }
      }, 1000);
    },
    [recoveryManager]
  );

  // ─────────────────────────── Session timer ───────────────────────────

  useEffect(() => {
    const running =
      sessionStatus === 'CONNECTED' || sessionStatus === 'RECONNECTING' || sessionStatus === 'RECOVERING';
    if (!running) return;

    const interval = setInterval(() => {
      const activeCtx = activeSessionRef.current?.context;
      if (!activeCtx || !isSessionActive(activeCtx, activeSessionRef.current?.context ?? null)) return;

      remainingSecondsRef.current = Math.max(0, remainingSecondsRef.current - 1);
      setRemainingSeconds(remainingSecondsRef.current);

      if (remainingSecondsRef.current <= 0) {
        clearInterval(interval);
        void endSessionRef.current('TIME_LIMIT');
      }
    }, 1000);

    sessionTimerRef.current = interval;
    return () => {
      clearInterval(interval);
      if (sessionTimerRef.current === interval) sessionTimerRef.current = null;
    };
    // Intentionally keyed on `running` only: the countdown must survive RECOVERING
    // without being reset by transport churn.
  }, [sessionStatus]);

  // ─────────────────────────── Relay transport ───────────────────────────
  //
  // F-42: socket creation, frame routing, and verified connection replacement now live in
  // `useRelayTransport`. This hook keeps the session, the tool dispatch, and the UI.

  const transport = useRelayTransport({
    activeSessionRef,
    wsRef,
    connectionAuthority,
    recoveryManager,
    goAwayRenewalManager,
    watchdogRef,
    reconnectRunnerRef,
    lastReportedFailureRef,
    transcriptStoreRef,
    memoryManagerRef,
    conversationMachineRef,
    isTurnFrozen,
    selectedVoiceId: selectedVoice.id,
    instructionOverride: systemInstructionOverride,
    resolveClientSessionContext,
    resetSilenceTimer,
    scheduleSilenceTimer,
    interruptAgent,
    queueAudioChunk,
    reportFailureOnce,
    isPlayingRef,
    setSessionStatus,
    setTransportStatus,
    setApiError,
    setTranscripts,
  });

  const { handleSocketMessage, executeSocketReconnect, teardownSocket, primeRelayCookie, openSocket } = transport;

  // Publish the verified-swap runner for frame handlers that need to request a replacement,
  // notably `GoAway` proactive renewal. Without this the ref keeps its rejecting stub, renewal
  // fails every time, and the only symptom is a warning in the console on a call that looks
  // fine until the provider actually closes the connection.
  reconnectRunnerRef.current = executeSocketReconnect;

  // ─────────────────────────── Session lifecycle ───────────────────────────


  const endSession = useCallback(
    async (reason: EndReason = 'USER_ENDED') => {
      const active = activeSessionRef.current;
      if (!active) {
        setSessionStatus('IDLE');
        setTransportStatus('DISCONNECTED');
        return;
      }

      await AuraSessionManager.executeEnd(active, reason, async (opId) => {
        console.log(`[Session Lifecycle] Authoritative shutdown sequence (${opId}) with reason: ${reason}`);

        // 1. Stop all authorities BEFORE any teardown so no late frame can be promoted.
        recoveryManager.cancel(reason);
        watchdogRef.current?.stop();
        watchdogRef.current = null;
        goAwayRenewalManager.reset();
        connectionAuthority.retireCurrent(reason);
        lastReportedFailureRef.current = null;

        // 2. State transition to ENDING
        active.context.endReason = reason;
        const nextSessionStatus = transitionSessionStatus(active.context.status, 'ENDING');
        active.context.status = nextSessionStatus;
        setSessionStatus(nextSessionStatus);

        // 3. Transport CLOSING
        if (active.transport.status !== 'CLOSING' && active.transport.status !== 'CLOSED') {
          const nextTransportStatus = transitionTransportStatus(active.transport.status, 'CLOSING');
          active.transport.status = nextTransportStatus;
          setTransportStatus(nextTransportStatus);
        }

        // 4. Timers, playback, microphone
        // A new call re-arms the inactivity ladder from scratch.
        silenceLadder.rearm();
        interruptAgent();
        stopMicCapture();

        // 5. Socket
        teardownSocket();
        // The call is over, so a held turn has nobody left to deliver it to.
        pendingPromptsRef.current.clear();

        // 6. Finalize
        AuraSessionManager.endSession(active, reason);
        setSessionStatus('ENDED');
        setTransportStatus('CLOSED');
        remainingSecondsRef.current = MAX_SESSION_SECONDS;
        await closeAudioContexts();
      });
    },
    [recoveryManager, goAwayRenewalManager, connectionAuthority, resetSilenceTimer, interruptAgent, stopMicCapture, teardownSocket, MAX_SESSION_SECONDS]
  );

  endSessionRef.current = endSession;

  const hardResetSession = useCallback(
    (nextPreset?: IndustryPreset): void => {
      console.log(`[Session Lifecycle] Executing Hard Reset. Invalidation generation -> ${generationRef.current + 1}`);

      recoveryManager.cancel('hard reset');
      watchdogRef.current?.stop();
      watchdogRef.current = null;
      goAwayRenewalManager.reset();
      connectionAuthority.reset('hard reset');
      lastReportedFailureRef.current = null;

      if (activeSessionRef.current) {
        activeSessionRef.current.context.endReason = 'PERSONA_SWITCH';
        activeSessionRef.current.context.status = 'ENDING';
      }
      generationRef.current += 1;

      stopMicCapture();
      // `interruptAgent` already stops the in-flight source and empties the queue, so the
      // persona switch cannot speak the old persona's last sentence in the new voice.
      interruptAgent();

      silenceLadder.cancelPending();
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }

      teardownSocket();

      // A prompt typed into the old conversation must not surface in the new one. On a persona
      // switch that would carry one caller's detail into another business's context.
      pendingPromptsRef.current.clear();

      const target = nextPreset || currentPreset;
      transcriptStoreRef.current = new TranscriptStore('sess_new', target.id);
      memoryManagerRef.current = new MemoryManager('sess_new', target.id, undefined, INITIAL_FACTS);
      conversationMachineRef.current.reset();

      setTranscripts([]);
      setMemoryState(memoryManagerRef.current.getState());
      setRuntimeState(INITIAL_CONVERSATION_STATE);
      setGreetingState('PENDING');
      setApiError(null);
      setMicError(null);
      setSystemInstructionOverride(null);

      setCurrentPreset(target);
      activeSessionRef.current = null;
      setSessionStatus('IDLE');
      setTransportStatus('DISCONNECTED');
      remainingSecondsRef.current = MAX_SESSION_SECONDS;
      setRemainingSeconds(MAX_SESSION_SECONDS);
    },
    [currentPreset, recoveryManager, goAwayRenewalManager, connectionAuthority, stopMicCapture, interruptAgent, teardownSocket, MAX_SESSION_SECONDS]
  );

  const startSession = useCallback(
    async (customPreset?: IndustryPreset): Promise<AuraSession | null> => {
      if (isStartingRef.current) {
        console.warn('[Session Lifecycle] startSession already in progress; ignoring duplicate request.');
        return activeSessionRef.current;
      }
      const targetPreset = customPreset || currentPreset;
      isStartingRef.current = true;

      try {
        return await AuraSessionManager.executeStart(targetPreset, activeSessionRef.current, async (opId) => {
          console.log(`[Session Lifecycle] Authoritative startSession sequence (${opId}) for "${targetPreset.businessName}"`);

          // 1. Tear down any previous session
          recoveryManager.cancel('new session');
          watchdogRef.current?.stop();
          watchdogRef.current = null;
          goAwayRenewalManager.reset();
          connectionAuthority.reset('new session');
          lastReportedFailureRef.current = null;

          stopMicCapture();
          interruptAgent();

          silenceLadder.cancelPending();
          if (sessionTimerRef.current) {
            clearInterval(sessionTimerRef.current);
            sessionTimerRef.current = null;
          }
          teardownSocket();

          // 2. Bump the session invalidation generation
          generationRef.current += 1;

          // 3. New authoritative session + connection identity from the Connection Authority
          const targetFacts = memoryManagerRef.current.getState().sessionFacts;
          const newActiveSession = AuraSessionManager.createSession(targetPreset, generationRef.current, targetFacts);
          const initialTicket = connectionAuthority.issueInitial('INITIAL');
          const initialConnection = AuraSessionManager.createConnection(
            newActiveSession,
            initialTicket.generation,
            selectedVoice.id,
            undefined,
            initialTicket.connectionId
          );
          AuraSessionManager.attachConnection(newActiveSession, initialConnection);

          const context = newActiveSession.context;
          const newSessionId = context.sessionId;

          transcriptStoreRef.current = new TranscriptStore(newSessionId, targetPreset.id);
          memoryManagerRef.current = new MemoryManager(newSessionId, targetPreset.id, undefined, INITIAL_FACTS);
          setMemoryState(memoryManagerRef.current.getState());
          setTranscripts([]);
          conversationMachineRef.current.reset();
          setRuntimeState(INITIAL_CONVERSATION_STATE);

          activeSessionRef.current = newActiveSession;
          setSessionStatus('CONNECTING');
          setTransportStatus('CONNECTING');
          setGreetingState('PENDING');
          setCurrentPreset(targetPreset);
          setApiError(null);
          setMicError(null);
          silenceLadder.rearm();
          remainingSecondsRef.current = MAX_SESSION_SECONDS;
          setRemainingSeconds(MAX_SESSION_SECONDS);

          // 4. Watchdog bound to the authoritative ticket
          watchdogRef.current = new GeminiWatchdog(
            newSessionId,
            initialTicket.connectionId,
            initialTicket.generation,
            recoveryManager,
            () => activeSessionRef.current,
            {
              onClassificationChanged: (classification: WatchdogHealthClassification) => {
                console.log(`[Watchdog] ${newSessionId} health=${classification}`);
              },
              onFailureDetected: (reason, classification) => {
                console.warn(`[Watchdog] ${classification}: ${reason}`);
                setApiError(`Connection degraded (${classification}). Attempting seamless recovery...`);
              },
            }
          );
          watchdogRef.current.start();

          const { compiledContext } = resolveClientSessionContext(false);

          // The relay cookie must be in place BEFORE the upgrade is sent.
          //
          // F-50: this used to fire the cookie fetch and the WebSocket open concurrently to save
          // a round trip. That saved nothing and cost a first-connection failure. The browser
          // attaches the HttpOnly cookie to the upgrade itself, so a socket opened while the
          // fetch is still in flight can reach the relay with no cookie and be refused with a
          // 401. Critically, a 401 arrives *during the HTTP upgrade*: `onopen` never fires, so
          // the in-`onopen` wait that used to sit below could not repair the race it was written
          // for. The visitor paid for that with a failed first attempt and a retry, which is the
          // exact thing this call exists to avoid.
          //
          // Awaiting costs nothing on any call after the first: `primeRelayCookie` memoises on
          // success, so the first call of a page pays one round trip and every subsequent call
          // resolves synchronously. There is no fast path to protect, only the first call to fix.
          const cookieReady = await primeRelayCookie();
          if (
            !ConnectionGuard.validateEvent(context, initialTicket.connectionId, initialTicket.generation, activeSessionRef.current)
          ) {
            // The session was ended or superseded while the cookie was priming. Opening a
            // socket now would create an unowned connection nobody is listening to. The
            // session object is still returned because that is this callback's contract; the
            // superseded session is already invalidated, so nothing will drive it.
            console.warn(
              '[Session Lifecycle] Session superseded while priming the relay cookie; ' +
                'not opening a socket for it.'
            );
            return newActiveSession;
          }
          if (!cookieReady) {
            // `configured: false` is a legitimate same-origin mode, so a false result is not by
            // itself fatal and the upgrade stays the authority. Logged so a genuinely failed
            // prime is visible instead of surfacing later as an opaque 401.
            console.warn(
              '[Session Lifecycle] Relay cookie did not confirm before the upgrade; ' +
                'attempting the socket anyway and deferring to the relay response.'
            );
          }
          const ws = openSocket();
          wsRef.current = ws;

          ws.onopen = () => {
            if (!ConnectionGuard.validateEvent(context, initialTicket.connectionId, initialTicket.generation, activeSessionRef.current)) {
              try { ws.close(); } catch (_) {}
              return;
            }
            console.log(`[Session Handshake] Socket connected for ${targetPreset.businessName}. Sending init_session...`);
            // The cookie was awaited above, so `init_session` can go out immediately.
            ws.send(
              JSON.stringify({
                type: 'init_session',
                connectionId: initialTicket.connectionId,
                sessionId: context.sessionId,
                personaId: context.personaId,
                voice: selectedVoice.id,
                // The base system prompt is composed SERVER-SIDE from the validated
                // persona registry. The client only supplies a bounded operator override.
                instructionOverride: systemInstructionOverride,
                sessionMemory: compiledContext,
              })
            );
          };

          ws.onmessage = (event) => {
            if (!ConnectionGuard.validateEvent(context, initialTicket.connectionId, initialTicket.generation, activeSessionRef.current)) {
              return;
            }
            let msg: any;
            try {
              msg = JSON.parse(event.data);
            } catch (err) {
              console.error('Error parsing WebSocket message:', err);
              return;
            }

            handleSocketMessage(msg, context, initialTicket, () => {
              const liveSession = activeSessionRef.current;
              if (!liveSession) return;
              console.log(`[Session Handshake] Verified for session ${context.sessionId}`);
              AuraSessionManager.markConnected(liveSession, initialTicket.connectionId, initialTicket.generation);
              watchdogRef.current?.updateConnection(initialTicket.connectionId, initialTicket.generation);
              setSessionStatus('CONNECTED');
              setTransportStatus('CONNECTED');
              liveSession.greeting = 'COMPLETED';
              setGreetingState('COMPLETED');
              setApiError(null);
              lastReportedFailureRef.current = null;
              recoveryManager.onConnectSuccess(context, initialTicket.connectionId, initialTicket.generation);

              try {
                const outCtx = getOutputAudioContext();
                if (outCtx.state === 'suspended') void outCtx.resume();
              } catch (_) {}

              if (!isPlayingRef.current) scheduleSilenceTimer(context);
              // Only acquire the microphone if it is not already live. Asking again here used to
              // re-prompt for a permission the caller had already granted.
              if (!hasLiveStream()) void startMicCapture(context);
              // The transport is verified, so anything typed while it was down can go now.
              flushPendingPrompts();
            });
          };

          ws.onerror = (err) => {
            if (!ConnectionGuard.validateEvent(context, initialTicket.connectionId, initialTicket.generation, activeSessionRef.current)) {
              return;
            }
            // F-35: this used to be a bare `console.error`, and a global handler in `main.tsx`
            // then swallowed it because the message mentioned a WebSocket. A relay that refused
            // the handshake - bad token, wrong origin, server down - was therefore a call that
            // failed with nothing on screen and nothing in the log. It is now reported like any
            // other transport fault.
            console.error('WebSocket network error:', err);
            reportFailureOnce('WEBSOCKET', 'WebSocket network error');
            setApiError('Connection to the voice relay failed. Check the relay token and try again.');
          };

          ws.onclose = (event: CloseEvent) => {
            if (!ConnectionGuard.validateEvent(context, initialTicket.connectionId, initialTicket.generation, activeSessionRef.current)) {
              return;
            }
            const liveSession = activeSessionRef.current;
            if (!liveSession) return;

            console.log(
              `[Transport Closed] ${initialTicket.connectionId} closed. Code: ${event?.code}, ` +
                `Reason: "${event?.reason || 'None'}", Clean: ${event?.wasClean}`
            );

            if (
              event?.code === 1000 ||
              isTurnFrozen() ||
              liveSession.context.endReason === 'USER_ENDED' ||
              liveSession.context.endReason === 'PERSONA_SWITCH' ||
              liveSession.context.endReason === 'TIME_LIMIT'
            ) {
              console.log('[Transport] Close observed as part of expected shutdown.');
              return;
            }

            console.log(`[Transport] Unexpected disconnect for ${initialTicket.connectionId} (code=${event?.code}).`);
            AuraSessionManager.handleConnectionFailure(
              liveSession,
              initialTicket.connectionId,
              `WebSocket closed with code ${event?.code || 'unknown'}`
            );
            setSessionStatus('RECONNECTING');
            setTransportStatus('RECONNECTING');
            liveSession.transport.lastDisconnectedAt = Date.now();
            resetSilenceTimer();
            reportFailureOnce('WEBSOCKET', event?.reason || `WebSocket closed with code ${event?.code || 'unknown'}`, event?.code);
          };

          console.log(
            `[Session Lifecycle] Session ${newSessionId} for "${targetPreset.businessName}" ` +
              `(Connection: ${initialTicket.connectionId}, Gen: ${initialTicket.generation})`
          );

          return newActiveSession;
        });
      } finally {
        isStartingRef.current = false;
      }
    },
    [
      currentPreset,
      selectedVoice,
      resolveClientSessionContext,
      handleSocketMessage,
      startMicCapture,
      interruptAgent,
      resetSilenceTimer,
      scheduleSilenceTimer,
      reportFailureOnce,
      isTurnFrozen,
      recoveryManager,
      goAwayRenewalManager,
      connectionAuthority,
      stopMicCapture,
      teardownSocket,
      MAX_SESSION_SECONDS,
      systemInstructionOverride,
    ]
  );

  // Persona boundary
  const switchPersona = useCallback(
    async (nextPreset: IndustryPreset) => {
      console.log(`[Session Lifecycle] Switching persona boundary to "${nextPreset.businessName}"`);
      setLockedPersonaId(nextPreset.id);
      try {
        localStorage.setItem(STORAGE_KEY_LOCKED_PERSONA, nextPreset.id);
      } catch (_) {}

      hardResetSession(nextPreset);

      if (activeSessionRef.current && (activeSessionRef.current.status !== 'ENDED' && activeSessionRef.current.context.status !== 'ENDED')) {
        await endSessionRef.current('PERSONA_SWITCH');
      }

      await startSession(nextPreset);
    },
    [hardResetSession, startSession]
  );

  const selectPreset = useCallback((preset: IndustryPreset) => void switchPersona(preset), [switchPersona]);
  const lockAndSelectPersona = useCallback((preset: IndustryPreset) => void switchPersona(preset), [switchPersona]);

  const unlockPersona = useCallback(() => {
    setLockedPersonaId(null);
    try {
      localStorage.removeItem(STORAGE_KEY_LOCKED_PERSONA);
    } catch (_) {}
    void endSessionRef.current('USER_ENDED');
  }, []);

  // ─────────────────────────── Outbound text ───────────────────────────

  /**
   * Records a caller turn in all three local layers.
   *
   * This runs the moment the user types, whether or not the transport can carry the turn. That
   * ordering is the fix for a defect this hook previously had: the frozen path returned early
   * before any of this executed, so a question typed during an outage reached the provider on
   * recovery but never reached the transcript, structured memory, or the conversation runtime.
   * The agent then answered a turn the UI had no record of, the runtime stayed in the wrong state
   * for the rest of the call, and a fact like "my name is Dana" typed mid-blip was never captured.
   *
   * `OutboundPromptQueue` must not repeat this work when it flushes, or the caller would see
   * their message twice; provider delivery is the queue's only job.
   */
  const commitUserTurnLocally = useCallback(
    (textPrompt: string, connectionId?: string) => {
      transcriptStoreRef.current.addMessage('user', textPrompt, connectionId);
      setTranscripts(
        transcriptStoreRef.current.getAll().map((m) => ({
          id: m.id,
          speaker: m.role === 'user' ? 'user' : 'agent',
          text: m.text,
          timestamp: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          rawTime: m.timestamp,
          isFinal: m.isFinal,
        }))
      );

      conversationMachineRef.current.processTurn('user', textPrompt);

      for (const item of extractSessionFactsFromText(textPrompt)) {
        memoryManagerRef.current.addSessionFact(item.content, item.category, 'USER');
      }
    },
    []
  );

  /**
   * Sends everything that was typed while the transport was down, now that it is verified.
   *
   * Ordering matters: the replacement is only allowed to report success after the handshake has
   * actually completed, so flushing from the verified path is what guarantees a queued prompt is
   * not sent into a socket that has not finished connecting. The caller is told what happened,
   * because a question they typed two minutes ago surfacing unprompted is noticeable, and
   * silence about it would be worse.
   */
  const flushPendingPrompts = useCallback(() => {
    const { deliver, expired, evicted } = pendingPromptsRef.current.drain();
    if (!deliver.length && !expired.length && !evicted.length) return;

    if (expired.length || evicted.length) {
      console.warn(
        `[Outbound] Discarded ${expired.length} stale and ${evicted.length} overflow prompt(s) during recovery.`
      );
    }

    // A discarded prompt was still a real turn the caller typed, and it is already in their
    // transcript because local state is committed at typing time. Silence here would leave them
    // reading their own question with no reply and no explanation.
    if (expired.length || evicted.length) {
      const total = expired.length + evicted.length;
      setApiError(
        `${total} of your earlier message${total === 1 ? ' was' : 's were'} not sent because the call took too long to recover. Please send ${total === 1 ? 'it' : 'them'} again.`
      );
    }

    if (!deliver.length) return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // Verified transport went away between the handshake and here. Put them back so the next
      // successful handshake still delivers them rather than losing a turn to a race. Re-queueing
      // does not re-commit local state; the turn was recorded when it was typed.
      for (const entry of deliver) pendingPromptsRef.current.enqueue(entry.text, entry.connectionId);
      return;
    }

    console.log(`[Outbound] Flushing ${deliver.length} prompt(s) held during recovery.`);
    for (const entry of deliver) {
      ws.send(JSON.stringify({ type: 'client_content', text: entry.text }));
    }
  }, []);

  const sendTextPrompt = useCallback(
    (textPrompt: string) => {
      if (!textPrompt.trim()) return;
      const active = activeSessionRef.current;
      const activeCtx = active?.context;
      if (!active || !activeCtx || !isSessionActive(activeCtx, active.context)) return;

      if (isTurnFrozen()) {
        // Hold the turn rather than dropping it. Local state is committed first so the caller sees
        // the question immediately, exactly as they would on a healthy transport, and the runtime
        // and memory stay consistent with what they can see.
        commitUserTurnLocally(textPrompt, active.transport.connectionId || undefined);

        const outcome = pendingPromptsRef.current.enqueue(
          textPrompt,
          active.transport.connectionId || undefined
        );
        if (outcome.accepted) {
          console.log(
            `[Outbound] Transport is recovering; holding prompt #${outcome.entry.id} for delivery.`
          );
          setApiError('Reconnecting - your message will be sent as soon as the call is back.');
        } else if (outcome.reason === 'TOO_LARGE') {
          // The turn is in the transcript, but it was never sent. Saying so beats a reconnect
          // message that will resolve to silence.
          console.warn('[Outbound] Refused an oversized prompt while recovering.');
          setApiError('That message is too long to send while reconnecting. Please shorten it.');
        } else {
          setApiError('Still reconnecting. Please try again in a moment.');
        }
        return;
      }

      resetSilenceTimer();
      watchdogRef.current?.beginTurn('outbound text prompt');

      commitUserTurnLocally(textPrompt, active.transport.connectionId || undefined);

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'client_content', text: textPrompt }));
      } else {
        setApiError('Transport unavailable. Text was not delivered.');
      }
    },
    [commitUserTurnLocally, isTurnFrozen, resetSilenceTimer]
  );

  // ─────────────────────────── Simple controls ───────────────────────────

  const toggleMic = useCallback(() => setIsMicMuted((prev) => !prev), []);
  const toggleAudioMute = useCallback(() => setIsAudioMuted((prev) => !prev), []);

  // Resume playback when the user unmutes, and pause - rather than discard - when they mute.
  useEffect(() => {
    if (isAudioMuted) {
      pausePlayback();
    } else {
      processPlaybackQueue();
    }
  }, [isAudioMuted, pausePlayback, processPlaybackQueue]);

  const clearTranscripts = useCallback(() => {
    transcriptStoreRef.current.clear();
    setTranscripts([]);
  }, []);

  const dispatchConversationEvent = useCallback((event: ConversationEvent) => conversationMachineRef.current.dispatch(event), []);

  // ─────────────────────────── Memory inspector ───────────────────────────
  //
  // F-28/F-42: the add/delete/reset operations, the protected seeded rules and the upstream
  // reset announcement live in `useSessionMemoryControls`.

  const { addMemoryFact, deleteMemoryFact, clearAllMemory, memoryFacts } = useSessionMemoryControls({
    memoryManagerRef,
    seededFacts: INITIAL_FACTS,
    sessionFacts: memoryState.sessionFacts,
    clearTranscripts,
    announceMemoryReset: (sessionId) => {
      // The server tracks its own active connection id for this session, so the frame only
      // needs to identify which call is being reset.
      const ws = wsRef.current;
      if (ws?.readyState !== WebSocket.OPEN) return false;
      try {
        ws.send(JSON.stringify({ type: 'session_memory_reset', sessionId }));
        console.log(`[Memory] Announced memory reset to the server for ${sessionId}.`);
        return true;
      } catch (err) {
        console.warn('[Memory] Could not announce the memory reset to the server:', err);
        return false;
      }
    },
  });

  // ─────────────────────────── Unmount teardown ───────────────────────────

  useEffect(
    () => () => {
      recoveryManager.cancel('component unmounted');
      watchdogRef.current?.stop();
      connectionAuthority.reset('component unmounted');
      silenceLadder.dispose();
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      teardownSocket();
      pendingPromptsRef.current.clear();
      stopMicCapture();
      void closeAudioContexts();
    },
    [recoveryManager, connectionAuthority, teardownSocket, stopMicCapture]
  );

  return {
    status,
    sessionStatus,
    transportStatus,
    audioState,
    greetingState,
    audioLevel,
    transcripts,
    memoryFacts,
    customerMemory: memoryState.customerMemory,
    runtimeState,
    dispatchConversationEvent,
    isBookingReady: conversationMachineRef.current.isBookingReady(),
    currentPreset,
    lockedPersonaId,
    isPersonaLocked: Boolean(lockedPersonaId),
    lockAndSelectPersona,
    unlockPersona,
    selectPreset,
    switchPersona,
    hardResetSession,
    remainingSeconds,
    MAX_SESSION_SECONDS,
    selectedVoice,
    setSelectedVoice,
    speechSpeedRate,
    setSpeechSpeedRate,
    // The editor's seed text, not a prompt. Nothing here is sent to the model as an
    // instruction; the server owns that. Exposing this as `systemInstruction` made the
    // browser look like a second prompt authority, which is the confusion F-07 came from.
    instructionEditorSeed: systemInstructionOverride ?? currentPreset.systemPrompt,
    setSystemInstruction: (value: string) => setSystemInstructionOverride(value),
    hasSystemInstructionOverride: systemInstructionOverride !== null,
    resetSystemInstruction: () => setSystemInstructionOverride(null),
    isMicMuted,
    isAudioMuted,
    micError,
    apiError,
    clearApiError: () => setApiError(null),
    isMemoryModalOpen,
    setIsMemoryModalOpen,
    addMemoryFact,
    deleteMemoryFact,
    clearAllMemory,
    retryMic: () => {
      if (activeSessionRef.current) {
        void startMicCapture(activeSessionRef.current.context);
      }
    },
    startSession,
    startAuraSession: startSession,
    endSession: () => endSessionRef.current('USER_ENDED'),
    endAuraSession: () => endSessionRef.current('USER_ENDED'),
    activeSession: activeSessionRef.current,
    activeConnection: activeSessionRef.current?.transport || null,
    connectionDiagnostics: connectionAuthority.getDiagnostics(),
    toggleMic,
    toggleAudioMute,
    interruptAgent,
    sendTextPrompt,
    clearTranscripts,
    isAgentSpeaking,
    isListening: sessionStatus === 'CONNECTED' && transportStatus === 'CONNECTED' && !isAgentSpeaking && !isMicMuted,
  };
}