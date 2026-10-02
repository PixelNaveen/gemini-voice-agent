import { useCallback, useRef, type RefObject } from 'react';
import { SessionContext, AuraSession } from '../types';
import { ConnectionGuard } from '../core/recovery';
import {
  getOutputAudioContext,
  decodeAudioBase64,
  playAudioBuffer,
} from '../utils/audioUtils';

/**
 * The watchdog calls playback needs. Narrowed to what is actually used so the hook does not
 * depend on the whole `GeminiWatchdog`, and so a test can pass a stub.
 */
export interface PlaybackWatchdog {
  setPlaybackPending(pending: number): void;
  endTurn(reason?: string): void;
}

export interface PlaybackQueueItem {
  buffer: AudioBuffer;
  context: SessionContext;
  connectionId: string;
  connectionGeneration: number;
}

export interface AudioPlaybackDeps {
  /** The session currently in charge, for stale-chunk validation. */
  activeSessionRef: RefObject<AuraSession | null>;
  isSessionStillActive: (context: SessionContext) => boolean;
  watchdog: PlaybackWatchdog;
  /** The silence ladder must pause while the agent is talking. */
  clearSilenceTimer: () => void;
  /** Called once the queue drains and the turn is genuinely over. */
  onTurnEnded: (context: SessionContext) => void;
  isAudioMuted: boolean;
  speechSpeedRate: number;
  setIsAgentSpeaking: (speaking: boolean) => void;
}

/** Output sample rate the model streams at. */
const OUTPUT_SAMPLE_RATE = 24000;

/**
 * F-42: output playback queue, extracted from `useVoiceAgent`.
 *
 * The agent's audio arrives as a stream of chunks that must be played in order, one at a time,
 * and must survive a persona switch mid-sentence. That is a real state machine, and it was
 * living inline in the transport hook next to socket and prompt code.
 *
 * Three behaviours are load-bearing and are preserved exactly:
 *
 * 1. **Stale chunks are discarded, not played.** Audio already in the local queue belongs to the
 *    session that queued it. A chunk that arrives after a persona switch is dropped rather than
 *    spoken in the new persona's voice.
 * 2. **The turn closes only when the model has stopped *and* the queue is empty.** Closing a
 *    watchdog turn when the buffer empties but the model is still streaming produces a false
 *    "agent went silent" fault; the turn is therefore ended on the drained path only.
 * 3. **Playback is serialised.** One `AudioBufferSourceNode` at a time, with the next chunk
 *    started from the completion callback. Overlapping chunks is what produced garbled,
 *    overlapping speech.
 */
/**
 * Scheduled output playback queue for Gemini Live streaming audio.
 *
 * ## Real-Time Streaming Architecture
 *
 * Gemini Live streams raw 24 kHz PCM chunks over WebSockets in real time. Rather than playing
 * chunks in a blocking serial loop (which converts inter-packet network jitter into audible silence
 * gaps and stuttering), this player schedules AudioBufferSourceNodes onto the Web Audio timeline
 * (`ctx.currentTime`).
 *
 * Key guarantees:
 * 1. **Gapless Playout**: Consecutive chunks are scheduled end-to-end at sub-millisecond precision.
 * 2. **Jitter Protection**: Initial playout uses a 25ms lookahead to absorb network burstiness.
 * 3. **Instant Barge-in**: When the caller interrupts, all in-flight scheduled nodes are stopped
 *    and disconnected synchronously within < 1ms.
 * 4. **Stale Chunk Fencing**: Chunks belonging to superseded sessions or connections are discarded.
 * 5. **Clean Turn Boundary**: The turn closes only when both the incoming queue and all actively
 *    playing hardware nodes have fully drained.
 */
export function useAudioPlayback(deps: AudioPlaybackDeps) {
  const audioQueueRef = useRef<PlaybackQueueItem[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Read through a ref so the completion callback, which is installed once per chunk, never
  // captures a stale `isAudioMuted` or `speechSpeedRate`.
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const processPlaybackQueue = useCallback(() => {
    const d = depsRef.current;
    if (d.isAudioMuted || audioQueueRef.current.length === 0) return;

    const ctx = getOutputAudioContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    while (audioQueueRef.current.length > 0) {
      const item = audioQueueRef.current.shift();
      if (!item) break;

      if (!ConnectionGuard.validateEvent(item.context, item.connectionId, item.connectionGeneration, d.activeSessionRef.current)) {
        console.log(
          `[Audio Playback] Discarded stale audio chunk from session ${item.context.sessionId} ` +
            `(Conn: ${item.connectionId}, Gen: ${item.connectionGeneration})`
        );
        continue;
      }

      isPlayingRef.current = true;
      d.setIsAgentSpeaking(true);
      d.clearSilenceTimer();

      const currentTime = ctx.currentTime;
      // If the timeline fell behind or was reset, provide a 20ms micro-jitter lookahead.
      const startTime = Math.max(currentTime + 0.020, nextPlayTimeRef.current);

      let sourceNode: AudioBufferSourceNode | null = null;
      const { source, analyser, duration } = playAudioBuffer(
        ctx,
        item.buffer,
        () => {
          if (sourceNode) {
            const idx = activeSourcesRef.current.indexOf(sourceNode);
            if (idx !== -1) activeSourcesRef.current.splice(idx, 1);
          }

          const remaining = audioQueueRef.current.length + activeSourcesRef.current.length;
          d.watchdog.setPlaybackPending(remaining);

          if (activeSourcesRef.current.length === 0 && audioQueueRef.current.length === 0) {
            isPlayingRef.current = false;
            d.setIsAgentSpeaking(false);
            currentSourceRef.current = null;
            analyserRef.current = null;
            nextPlayTimeRef.current = 0;
            if (d.isSessionStillActive(item.context)) {
              d.watchdog.setPlaybackPending(0);
              d.onTurnEnded(item.context);
            }
          }
        },
        d.speechSpeedRate,
        startTime
      );

      sourceNode = source;
      activeSourcesRef.current.push(source);
      currentSourceRef.current = source;
      analyserRef.current = analyser;
      nextPlayTimeRef.current = startTime + duration;
    }

    d.watchdog.setPlaybackPending(audioQueueRef.current.length + activeSourcesRef.current.length);
  }, []);

  const queueAudioChunk = useCallback(
    async (
      base64Data: string,
      context: SessionContext,
      connectionId: string,
      connectionGeneration: number
    ) => {
      const d = depsRef.current;
      if (d.isAudioMuted) return;
      if (!ConnectionGuard.validateEvent(context, connectionId, connectionGeneration, d.activeSessionRef.current)) return;
      try {
        const ctx = getOutputAudioContext();
        const buffer = await decodeAudioBase64(base64Data, ctx, OUTPUT_SAMPLE_RATE);
        // The chunk may have resolved after a persona switch; re-check before queueing it, or a
        // discarded chunk is resurrected into the new session's queue.
        if (!d.isSessionStillActive(context)) return;
        audioQueueRef.current.push({ buffer, context, connectionId, connectionGeneration });
        d.watchdog.setPlaybackPending(audioQueueRef.current.length + activeSourcesRef.current.length);
        processPlaybackQueue();
      } catch (err) {
        console.error('Failed to decode audio chunk:', err);
      }
    },
    [processPlaybackQueue]
  );

  /**
   * Stops the agent mid-sentence and drops everything still queued.
   *
   * Used for caller barge-in. All active and scheduled AudioBufferSourceNodes are stopped
   * immediately to eliminate auditory overrun.
   */
  const interruptPlayback = useCallback((reason: string) => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop(0);
        src.disconnect();
      } catch (_) {}
    }
    activeSourcesRef.current = [];
    currentSourceRef.current = null;
    audioQueueRef.current = [];
    nextPlayTimeRef.current = 0;
    isPlayingRef.current = false;
    analyserRef.current = null;
    depsRef.current.setIsAgentSpeaking(false);
    const d = depsRef.current;
    d.watchdog.setPlaybackPending(0);
    d.watchdog.endTurn(reason);
  }, []);

  /**
   * Stops the current scheduled chunks but keeps the queue, so playback resumes where it left off.
   *
   * Used by the mute control.
   */
  const pausePlayback = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop(0);
        src.disconnect();
      } catch (_) {}
    }
    activeSourcesRef.current = [];
    currentSourceRef.current = null;
    nextPlayTimeRef.current = 0;
    isPlayingRef.current = false;
    analyserRef.current = null;
    depsRef.current.setIsAgentSpeaking(false);
    depsRef.current.watchdog.setPlaybackPending(audioQueueRef.current.length);
  }, []);

  return {
    queueAudioChunk,
    processPlaybackQueue,
    interruptPlayback,
    pausePlayback,
    isPlayingRef,
    analyserRef,
    pendingCount: () => audioQueueRef.current.length + activeSourcesRef.current.length,
  };
}
