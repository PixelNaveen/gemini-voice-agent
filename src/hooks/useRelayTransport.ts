import { useCallback, useRef, type MutableRefObject } from 'react';

import { AuraSessionManager } from '../core/session/AuraSessionManager';
import { ConnectionAuthority, type ConnectionTicket } from '../core/connection/ConnectionAuthority';
import { ConnectionGuard } from '../core/recovery';
import { GoAwayRenewalManager } from '../core/renewal/GoAwayRenewalManager';
import { RecoveryManager } from '../core/recovery';
import type { GeminiWatchdog } from '../core/watchdog/GeminiWatchdog';
import { extractSessionFactsFromText } from '../utils/transcriptUtils';
import type { TranscriptStore } from '../core/memory/TranscriptStore';
import type { MemoryManager } from '../core/memory/MemoryManager';
import type { ConversationMachine } from '../core/conversation/ConversationMachine';
import type {
  ActiveSession,
  SessionContext,
  SessionStatus,
  TransportStatus,
  TranscriptItem,
} from '../types';

/**
 * F-42: the relay transport, extracted from `useVoiceAgent`.
 *
 * What this owns: opening sockets, routing frames off them, and swapping one connection for
 * another under `ConnectionAuthority` control. Nothing else.
 *
 * The reconnect contract, which is the reason this is worth isolating rather than inlining:
 *
 * - A replacement is only ever reported as successful after the relay sends
 *   `status: connected`. The previous implementation resolved `true` synchronously, so an
 *   unverified socket was reported as a completed swap and the caller sat on a dead transport
 *   believing otherwise.
 * - The outgoing socket is **not** closed up front. Promotion happens atomically on
 *   verification; a failed handoff therefore degrades to "still on the old connection" instead
 *   of "no connection at all". Every failure path - timeout, early close, stale handoff -
 *   restores `wsRef` to the outgoing socket.
 * - Fencing is applied to frames on the replacement socket *before* parsing, and again before
 *   promoting, so a frame that arrives after the session moved on cannot mutate state.
 */

/** How long a replacement socket has to prove itself before being discarded. */
export const HANDSHAKE_VERIFY_TIMEOUT_MS = 20_000;

/**
 * How long an open socket will wait for the relay cookie to finish priming before sending
 * `init_session` anyway.
 *
 * Only the first call of a page can hit this, and only when priming is genuinely slower than
 * the upgrade. The cap exists so a stalled fetch degrades into the server's own 401 - which is
 * reported to the user - rather than a call that simply never sends its handshake.
 */
export const RELAY_COOKIE_PRIME_WAIT_MS = 1_500;

export interface RelayTransportDeps {
  activeSessionRef: MutableRefObject<ActiveSession | null>;
  /** The socket currently in use. Null when no transport is live. */
  wsRef: MutableRefObject<WebSocket | null>;
  connectionAuthority: ConnectionAuthority;
  recoveryManager: RecoveryManager;
  goAwayRenewalManager: GoAwayRenewalManager;
  watchdogRef: MutableRefObject<GeminiWatchdog | null>;
  /** The most recent reconnect runner, so a frame handler can request a renewal. */
  reconnectRunnerRef: MutableRefObject<
    (ticket: ConnectionTicket, opId: string, mode: 'RESUME' | 'FRESH', handle: string | null) => Promise<boolean>
  >;
  /** Clears the last reported failure so a successful reconnect clears the visible error. */
  lastReportedFailureRef: MutableRefObject<string | null>;
  transcriptStoreRef: MutableRefObject<TranscriptStore>;
  memoryManagerRef: MutableRefObject<MemoryManager>;
  conversationMachineRef: MutableRefObject<ConversationMachine>;

  isTurnFrozen: () => boolean;
  /** Voice id sent on the handshake. Read through the ref so a UI change does not re-arm a swap. */
  selectedVoiceId: string;
  /** Bounded operator prompt override, or null. */
  instructionOverride: string | null;
  resolveClientSessionContext: (isRecovery: boolean) => { compiledContext: string };
  resetSilenceTimer: () => void;
  scheduleSilenceTimer: (context: SessionContext) => void;
  interruptAgent: () => void;
  queueAudioChunk: (data: string, context: SessionContext, connectionId: string, generation: number) => Promise<void> | void;
  reportFailureOnce: (source: 'GEMINI' | 'WEBSOCKET' | 'WATCHDOG' | 'MANUAL', reason: string, code?: number | string) => void;
  isPlayingRef: MutableRefObject<boolean>;

  setSessionStatus: (status: SessionStatus) => void;
  setTransportStatus: (status: TransportStatus) => void;
  setApiError: (message: string | null) => void;
  setTranscripts: (items: TranscriptItem[]) => void;
}

export interface RelayTransport {
  /** Routes one decoded frame from the relay. */
  handleSocketMessage: (
    msg: any,
    context: SessionContext,
    ticket: ConnectionTicket,
    onVerified: () => void
  ) => void;
  /**
   * Creates a replacement transport. Resolves `true` only after the relay confirms
   * `status: connected`; `false` leaves the previous socket in place.
   */
  executeSocketReconnect: (
    ticket: ConnectionTicket,
    opId?: string,
    mode?: 'RESUME' | 'FRESH',
    resumptionHandle?: string | null
  ) => Promise<boolean>;
  /** Closes the current socket and detaches its handlers. */
  teardownSocket: () => void;
  /** Obtains the relay cookie before the socket is opened. */
  primeRelayCookie: () => Promise<boolean>;
  /** Builds the relay URL for the current origin. */
  relayUrl: () => string;
  /** Opens a raw socket to the relay, without handlers. */
  openSocket: () => WebSocket;
}

export function useRelayTransport(deps: RelayTransportDeps): RelayTransport {
  // Held in a ref so the callbacks below do not re-create on every parent render, which would
  // tear down and re-arm the in-flight replacement socket on unrelated UI state changes.
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const recordProviderActivity = useCallback((msg: any) => {
    depsRef.current.watchdogRef.current?.recordProviderEvent(msg?.type ? String(msg.type) : 'event');
  }, []);

  const handleSocketMessage = useCallback(
    (
      msg: any,
      context: SessionContext,
      ticket: ConnectionTicket,
      onVerified: () => void
    ) => {
      const d = depsRef.current;
      const currentActive = d.activeSessionRef.current;
      if (!currentActive) return;

      // The relay echoes connectionId on status frames; if present it must match. A frame
      // addressed to another connection is not ours to act on.
      if (msg?.connectionId && msg.connectionId !== ticket.connectionId) {
        console.warn(
          `[Relay] Ignoring frame for ${msg.connectionId} on socket bound to ${ticket.connectionId}`
        );
        return;
      }

      recordProviderActivity(msg);

      switch (msg.type) {
        case 'status': {
          if (msg.state === 'connected') {
            onVerified();
            return;
          }
          if (msg.state === 'disconnected') {
            const active = d.activeSessionRef.current;
            if (!active || d.isTurnFrozen()) return;
            // The provider's close code and reason are the only evidence of *why* an upstream
            // session ended. Dropping them reduced every disconnect to the same
            // "Upstream disconnected" line, which made it impossible to tell an idle timeout
            // from a quota kill from a network reset, and therefore impossible to decide whether
            // a keep-alive was the fix. They are forwarded to the recovery log verbatim.
            const closeCode = msg.code === undefined || msg.code === null ? 'none' : String(msg.code);
            const closeReason = msg.reason ? String(msg.reason) : 'unspecified';
            console.warn(
              `[Transport] Upstream disconnected for ${ticket.connectionId} ` +
                `(code: ${closeCode}, reason: ${closeReason})`
            );
            AuraSessionManager.handleConnectionFailure(
              active,
              ticket.connectionId,
              `Upstream disconnected (code: ${closeCode}, reason: ${closeReason})`
            );
            d.setSessionStatus('RECONNECTING');
            d.setTransportStatus('RECONNECTING');
            d.reportFailureOnce('GEMINI', 'Live session closed by upstream');
          }
          return;
        }

        case 'session_resumption_update': {
          AuraSessionManager.updateResumptionState(
            currentActive,
            ticket.connectionId,
            msg.handle,
            msg.resumable
          );
          return;
        }

        // F-11: the server has reattached this call after a refresh or a dropped transport.
        //
        // The greeting guard is the load-bearing part. `AuraSessionManager` resets its greeting
        // flag for a new connection, so without this the agent re-introduces itself on a call
        // the caller is already in the middle of - the exact symptom that made a refresh feel
        // like the agent forgot the conversation. The server is the authority, so its
        // instruction is followed rather than re-derived.
        case 'session_resumed': {
          if (msg.suppressGreeting) {
            AuraSessionManager.markGreetingDelivered(currentActive);
            console.log(
              `[Session Resume] Continuing call ${msg.sessionId} at stage "${msg.stage}" ` +
                `after ${msg.recoveries} interruption(s); greeting suppressed.`
            );
          }
          // Surface the pause honestly. The caller should know the line glitched rather than
          // wondering why the agent went quiet. It is a transparency message, not an error, so
          // it is not routed to `apiError`.
          if (msg.notice) console.info(`[Session Resume] ${msg.notice}`);
          return;
        }

        case 'goaway': {
          console.warn(
            `[GoAway] Upstream signal for ${msg.connectionId || ticket.connectionId} (timeRemaining: ${msg.timeRemaining})`
          );
          void d.goAwayRenewalManager
            .handleGoAway(
              {
                auraSessionId: context.sessionId,
                connectionId: msg.connectionId || ticket.connectionId,
                connectionGeneration: ticket.generation,
                timeRemaining: msg.timeRemaining,
                timestamp: Date.now(),
              },
              d.activeSessionRef.current,
              {
                onInitiateReplacement: async (renewalTicket) =>
                  d.reconnectRunnerRef.current(renewalTicket, 'goaway', 'FRESH', null),
                onReplacementVerified: (_ctx, oldId, newId) => {
                  console.log(`[GoAway] Proactive swap verified: ${oldId} -> ${newId}`);
                },
                onRenewalFailed: (_ctx, err) => {
                  console.warn(`[GoAway] Proactive renewal failed: ${err}`);
                },
              }
            )
            .then((ok) => {
              if (!ok) d.reportFailureOnce('WEBSOCKET', 'goaway renewal failed');
            });
          return;
        }

        case 'audio': {
          if (!msg.data) return;
          d.watchdogRef.current?.recordAudioReceived();
          void d.queueAudioChunk(msg.data, context, ticket.connectionId, ticket.generation);
          return;
        }

        case 'transcript': {
          if (!msg.text) return;
          d.watchdogRef.current?.recordProviderEvent('transcript');
          if (msg.speaker === 'user') {
            d.resetSilenceTimer();
            d.watchdogRef.current?.beginTurn('caller transcript');
          }

          d.transcriptStoreRef.current.addMessage(
            msg.speaker === 'user' ? 'user' : 'assistant',
            msg.text,
            ticket.connectionId
          );
          d.setTranscripts(
            d.transcriptStoreRef.current.getAll().map((m: any) => ({
              id: m.id,
              speaker: m.role === 'user' ? 'user' : 'agent',
              text: m.text,
              timestamp: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              rawTime: m.timestamp,
              isFinal: m.isFinal,
            }))
          );

          d.conversationMachineRef.current.processTurn(msg.speaker || 'agent', msg.text);

          for (const item of extractSessionFactsFromText(msg.text)) {
            d.memoryManagerRef.current.addSessionFact(item.content, item.category, 'USER');
          }
          return;
        }

        case 'interrupted': {
          d.resetSilenceTimer();
          d.interruptAgent();
          return;
        }

        case 'error': {
          const errMsg = String(msg.message || 'Live session error');
          console.warn('[Gemini Live Error]', errMsg);
          const lower = errMsg.toLowerCase();
          d.setApiError(
            lower.includes('quota') || lower.includes('resource_exhausted')
              ? 'Gemini API quota limit reached. Please check your API key billing.'
              : errMsg
          );
          return;
        }

        default:
          return;
      }
    },
    [recordProviderActivity]
  );

  const relayUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/live`;
  }, []);

  /**
   * Fetches the relay cookie, at most once per transport instance.
   *
   * This sat on the critical path of every call: `startSession` awaited it before opening the
   * socket, so each call paid a full HTTP round trip before a single WebSocket frame was sent.
   * The cookie is HttpOnly and long-lived, so after the first call the browser already has it
   * and the fetch was pure latency. It is now memoised on success, so only the first call of a
   * page pays for it.
   *
   * The in-flight promise is shared rather than just the result, so two calls racing at startup
   * do not issue two requests - the caller that arrives second awaits the first one's fetch.
   * A failure is *not* cached: the cookie may simply not have been issued yet, and caching a
   * failure would leave the relay permanently unable to authenticate for the rest of the page.
   */
  const cookiePrimedRef = useRef(false);
  const cookieInFlightRef = useRef<Promise<boolean> | null>(null);

  const primeRelayCookie = useCallback(async (): Promise<boolean> => {
    if (cookiePrimedRef.current) return true;
    if (cookieInFlightRef.current) return cookieInFlightRef.current;

    const inFlight = (async () => {
      try {
        const response = await fetch('/api/live-token', { credentials: 'include' });
        // `configured: false` is a supported mode - same-origin relay with no token - so a
        // 200 that reports the relay is unconfigured is a success, not a failure to prime.
        if (!response.ok) return false;
        let primed = true;
        try {
          const body = (await response.json()) as { configured?: boolean };
          primed = body?.configured !== false;
        } catch {
          // A body we cannot parse still means the endpoint answered; treat the cookie as
          // attempted and let the upgrade be the real authority on whether it worked.
          primed = true;
        }
        if (primed) cookiePrimedRef.current = true;
        return primed;
      } catch {
        return false;
      } finally {
        cookieInFlightRef.current = null;
      }
    })();

    cookieInFlightRef.current = inFlight;
    return inFlight;
  }, []);

  const openSocket = useCallback(() => new WebSocket(relayUrl()), [relayUrl]);

  const executeSocketReconnect = useCallback(
    async (
      ticket: ConnectionTicket,
      _opId?: string,
      mode: 'RESUME' | 'FRESH' = 'FRESH',
      resumptionHandle?: string | null
    ): Promise<boolean> => {
      const d = depsRef.current;
      const active = d.activeSessionRef.current;
      const context = active?.context;
      if (!active || !context || !AuraSessionManager.canRecover(active)) {
        console.warn('[ConnectionAuthority] Reconnect aborted: session is no longer active or recoverable.');
        return false;
      }

      d.connectionAuthority.assertInvariants();

      const outgoing = d.wsRef.current;
      await primeRelayCookie();
      const ws = new WebSocket(relayUrl());

      d.setTransportStatus('CONNECTING');

      const { compiledContext } = d.resolveClientSessionContext(true);

      // Pre-promotion fencing. The session transport still points at the outgoing connection,
      // so a replacement ticket must be vetted by the authority, not by transport identity.
      const handoffIsValid = (): boolean =>
        ConnectionGuard.validateHandoffEvent(context, ticket, d.activeSessionRef.current, {
          inFlight: d.connectionAuthority.isInFlight(),
          current: d.connectionAuthority.isCurrent(ticket.connectionId, ticket.generation),
        });

      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(verifyTimer);
          resolve(ok);
        };

        const discard = () => {
          try {
            ws.onopen = null;
            ws.onmessage = null;
            ws.onerror = null;
            ws.onclose = null;
            ws.close();
          } catch {
            // Already closing; nothing further to do.
          }
        };

        const verifyTimer = setTimeout(() => {
          console.error(
            `[ConnectionAuthority] Replacement ${ticket.connectionId} (Gen ${ticket.generation}) did NOT verify ` +
              `within ${HANDSHAKE_VERIFY_TIMEOUT_MS}ms. Discarding it.`
          );
          discard();
          if (d.wsRef.current === ws) d.wsRef.current = outgoing;
          d.setTransportStatus('RECONNECTING');
          finish(false);
        }, HANDSHAKE_VERIFY_TIMEOUT_MS);

        ws.onopen = () => {
          if (!handoffIsValid()) {
            try {
              ws.close();
            } catch {
              // Closing an unopened socket can throw; the promise still settles below.
            }
            finish(false);
            return;
          }
          console.log(
            `[ConnectionAuthority] Replacement socket open. Mode: ${mode}, Resumption: ${Boolean(resumptionHandle)} ` +
              `(Session: ${context.sessionId}, Connection: ${ticket.connectionId}, Gen: ${ticket.generation})`
          );
          ws.send(
            JSON.stringify({
              type: 'reconnect_session',
              connectionId: ticket.connectionId,
              sessionId: context.sessionId,
              personaId: context.personaId,
              voice: d.selectedVoiceId,
              instructionOverride: d.instructionOverride,
              sessionMemory: compiledContext,
              resumptionHandle: mode === 'RESUME' ? resumptionHandle : null,
            })
          );
        };

        ws.onmessage = (event) => {
          if (!handoffIsValid()) return;
          let msg: any;
          try {
            msg = JSON.parse(event.data);
          } catch (err) {
            console.error('[ConnectionAuthority] Malformed frame on replacement socket:', err);
            return;
          }

          handleSocketMessage(msg, context, ticket, () => {
            // ── VERIFIED ──────────────────────────────────────────────
            try {
              d.connectionAuthority.assertInvariants();
            } catch (e) {
              console.error(e);
            }

            const liveSession = d.activeSessionRef.current;
            if (!liveSession || liveSession.context.sessionId !== context.sessionId) {
              try {
                ws.close();
              } catch {
                // Verified against a session that has since gone away; nothing to preserve.
              }
              finish(false);
              return;
            }

            const newConnection = AuraSessionManager.createConnection(
              liveSession,
              ticket.generation,
              d.selectedVoiceId,
              undefined,
              ticket.connectionId
            );
            AuraSessionManager.attachConnection(liveSession, newConnection);
            AuraSessionManager.handleRecoverySuccess(liveSession, ticket.connectionId, ticket.generation);

            // Promote atomically, then retire the outgoing transport.
            d.wsRef.current = ws;
            if (outgoing && outgoing !== ws) {
              try {
                outgoing.onopen = null;
                outgoing.onmessage = null;
                outgoing.onerror = null;
                outgoing.onclose = null;
                outgoing.close();
              } catch {
                // The old socket is being discarded; a throw here is not actionable.
              }
            }

            d.watchdogRef.current?.updateConnection(ticket.connectionId, ticket.generation);
            d.setTransportStatus('CONNECTED');
            d.setSessionStatus('CONNECTED');
            d.setApiError(null);
            d.lastReportedFailureRef.current = null;
            d.recoveryManager.onConnectSuccess(context, ticket.connectionId, ticket.generation);

            console.log(
              `[ConnectionAuthority] Replacement VERIFIED: ${ticket.connectionId} (Gen ${ticket.generation}, Mode: ${mode})`
            );

            if (!d.isPlayingRef.current) d.scheduleSilenceTimer(context);
            finish(true);
          });
        };

        ws.onerror = (err) => {
          if (!ConnectionGuard.validateEvent(context, ticket.connectionId, ticket.generation, d.activeSessionRef.current)) {
            return;
          }
          console.error('[ConnectionAuthority] Replacement socket network error:', err);
        };

        ws.onclose = (event) => {
          // A close before verification means the handoff failed. The outgoing socket, if any,
          // is still ours, so the next recovery attempt starts cleanly.
          if (settled) return;
          console.error(
            `[ConnectionAuthority] Replacement ${ticket.connectionId} closed before verification ` +
              `(code=${event?.code}).`
          );
          if (d.wsRef.current === ws) d.wsRef.current = outgoing;
          d.setTransportStatus('RECONNECTING');
          finish(false);
        };
      });
    },
    [handleSocketMessage, primeRelayCookie, relayUrl]
  );

  const teardownSocket = useCallback(() => {
    const d = depsRef.current;
    if (d.wsRef.current) {
      const oldWs = d.wsRef.current;
      d.wsRef.current = null;
      oldWs.onopen = null;
      oldWs.onmessage = null;
      oldWs.onerror = null;
      oldWs.onclose = null;
      try {
        oldWs.close();
      } catch {
        // Closing an already-closed socket throws in some engines; teardown is idempotent.
      }
    }
  }, []);

  return { handleSocketMessage, executeSocketReconnect, teardownSocket, primeRelayCookie, relayUrl, openSocket };
}
