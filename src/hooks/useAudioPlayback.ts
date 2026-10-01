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
export function useAudioPlayback(deps: AudioPlaybackDeps) {
  const audioQueueRef = useRef<PlaybackQueueItem[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Read through a ref so the completion callback, which is installed once per chunk, never
  // captures a stale `isAudioMuted` or `speechSpeedRate`.
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const processPlaybackQueue = useCallback(() => {
    const d = depsRef.current;
    if (isPlayingRef.current || audioQueueRef.current.length === 0 || d.isAudioMuted) return;

    const item = audioQueueRef.current.shift();
    if (!item) return;
    d.watchdog.setPlaybackPending(audioQueueRef.current.length);

    if (!ConnectionGuard.validateEvent(item.context, item.connectionId, item.connectionGeneration, d.activeSessionRef.current)) {
      console.log(
        `[Audio Playback] Discarded stale audio chunk from session ${item.context.sessionId} ` +
          `(Conn: ${item.connectionId}, Gen: ${item.connectionGeneration})`
      );
      if (audioQueueRef.current.length > 0) processPlaybackQueue();
      return;
    }

    isPlayingRef.current = true;
    d.setIsAgentSpeaking(true);
    d.clearSilenceTimer();

    const ctx = getOutputAudioContext();

    const { source, analyser } = playAudioBuffer(
      ctx,
      item.buffer,
      () => {
        isPlayingRef.current = false;
        d.setIsAgentSpeaking(false);
        currentSourceRef.current = null;
        analyserRef.current = null;
        if (!d.isSessionStillActive(item.context)) return;

        if (audioQueueRef.current.length > 0) {
          processPlaybackQueue();
        } else {
          // The model has finished producing AND the local buffer is empty: the turn is
          // genuinely over. This is the only correct place to close a watchdog turn.
          d.watchdog.setPlaybackPending(0);
          d.onTurnEnded(item.context);
        }
      },
      d.speechSpeedRate
    );

    currentSourceRef.current = source;
    analyserRef.current = analyser;
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
        d.watchdog.setPlaybackPending(audioQueueRef.current.length);
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
   * Used for caller barge-in. The pending playback count is zeroed and the turn is closed
   * because the caller has taken the floor, which is a different end state from the queue
   * draining normally.
   */
  const interruptPlayback = useCallback((reason: string) => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (_) {}
      currentSourceRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    analyserRef.current = null;
    depsRef.current.setIsAgentSpeaking(false);
    const d = depsRef.current;
    d.watchdog.setPlaybackPending(0);
    d.watchdog.endTurn(reason);
  }, []);

  /**
   * Stops the current chunk but keeps the queue, so playback resumes where it left off.
   *
   * Used by the mute control. The previous behaviour emptied the queue on mute, which meant an
   * operator who muted for a moment permanently lost the rest of the agent's sentence, and the
   * `if (!isAudioMuted) processPlaybackQueue()` resume path had nothing left to resume. The
   * caller simply never heard the answer.
   */
  const pausePlayback = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (_) {}
      currentSourceRef.current = null;
    }
    isPlayingRef.current = false;
    analyserRef.current = null;
    depsRef.current.setIsAgentSpeaking(false);
    // The buffered audio still exists, so the watchdog must keep waiting for it to be played.
    depsRef.current.watchdog.setPlaybackPending(audioQueueRef.current.length);
  }, []);

  return {
    queueAudioChunk,
    processPlaybackQueue,
    interruptPlayback,
    pausePlayback,
    isPlayingRef,
    analyserRef,
    pendingCount: () => audioQueueRef.current.length,
  };
}
