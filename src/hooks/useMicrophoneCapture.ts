import { useCallback, useRef, type RefObject } from 'react';
import { SessionContext, AudioState } from '../types';
import {
  getInputAudioContext,
  float32ToInt16PCM,
  arrayBufferToBase64,
  createSilentSink,
} from '../utils/audioUtils';

export interface MicrophoneCaptureDeps {
  /** False once the session has ended or been replaced, so late audio is discarded. */
  isSessionStillActive: (context: SessionContext) => boolean;
  /** The live socket. Read through the ref so the closure never captures a stale socket. */
  wsRef: RefObject<WebSocket | null>;
  /** True while the agent's own audio is playing, which gates echo suppression. */
  isPlayingRef: RefObject<boolean>;
  /** Publishes the mic analyser for the visualiser when the agent is not speaking. */
  publishMicAnalyser: (analyser: AnalyserNode) => void;
  isMicMuted: boolean;
  isTurnFrozen: () => boolean;
  /** Caller speech was detected, so the silence ladder must be reset. */
  onVoiceActivity: () => void;
  /** A PCM frame was sent upstream. */
  onAudioSent: () => void;
  setMicError: (message: string | null) => void;
  setAudioState: (updater: (prev: AudioState) => AudioState) => void;
}

/** Samples per upstream frame. 16 kHz mono, so 2048 samples is 128 ms of speech. */
const FRAME_SAMPLES = 2048;

/** RMS above this counts as the caller speaking rather than room noise. */
const VOICE_RMS_THRESHOLD = 0.012;

/** RMS below this is echo residue from the agent's own voice. */
const ECHO_RMS_THRESHOLD = 0.002;

/**
 * F-42: microphone acquisition, extracted from `useVoiceAgent`.
 *
 * This block was ~180 lines inside a hook that was already over 1700, and it owned six refs
 * plus the permission and single-flight logic. Every fix to transport, prompt or memory code
 * therefore had to be made in the same file as the audio code, which is how the two drifted:
 * `stopMicCapture` was reachable from teardown, `startMicCapture` from the handshake, and the
 * visualiser read `micAnalyserRef` from a different section again.
 *
 * Two behaviours are load-bearing and are preserved exactly:
 *
 * 1. **Single-flight acquisition.** A second concurrent `start` must not trigger a second
 *    permission prompt or a second `MediaStream`, which produced two simultaneous live
 *    captures of the caller.
 * 2. **A silent sink.** A capture node must be connected to a destination to be pulled, but that
 *    destination must be silent. Connecting to `ctx.destination` plays the caller out loud
 *    through the speakers and creates an acoustic feedback loop.
 *
 * Capture prefers `AudioWorkletNode` and falls back to the deprecated `ScriptProcessorNode` only
 * when the worklet genuinely cannot be used. The fallback logs a loud, one-time error, because a
 * silent fallback is how a call appears to work while running on a code path the browser has
 * marked for removal.
 */
/**
 * Same-origin URL for the capture worklet, served from `public/aura-mic-worklet.js`.
 *
 * This is a real file rather than a `Blob` URL on purpose. `AudioWorklet.addModule()` honours the
 * page's `script-src` CSP, and the shipped policy deliberately does not allow `blob:` there. An
 * earlier version built the worklet source into a blob at runtime; the browser refused to load it,
 * the rejection was swallowed by a bare `catch`, and the only symptom was the app quietly falling
 * back to the deprecated `ScriptProcessorNode` path. The worklet was never actually running, and
 * nothing in the application log said so.
 */
const WORKLET_MODULE_URL = '/aura-mic-worklet.js';

let workletLoadFailed = false;
async function ensureWorkletLoaded(ctx: AudioContext): Promise<boolean> {
  if (!ctx.audioWorklet) return false;
  try {
    await ctx.audioWorklet.addModule(WORKLET_MODULE_URL);
    workletLoadFailed = false;
    return true;
  } catch (err) {
    // Never fail silently again: a missing worklet means the app is running on a deprecated
    // capture path, and the operator needs to be able to see that in the console.
    if (!workletLoadFailed) {
      workletLoadFailed = true;
      console.error(
        `[Microphone] AudioWorklet "${WORKLET_MODULE_URL}" failed to load; ` +
          `falling back to the deprecated ScriptProcessorNode path. Cause: ${
            (err as Error)?.message || String(err)
          }`
      );
    }
    return false;
  }
}

export function useMicrophoneCapture(deps: MicrophoneCaptureDeps) {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioProcessorRef = useRef<AudioNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const silentSinkRef = useRef<GainNode | null>(null);
  const micInitInFlightRef = useRef<boolean>(false);

  // Read through refs so `start` keeps a stable identity and `onaudioprocess`, which is
  // installed once for the life of the stream, never captures a stale callback.
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const stopMicCapture = useCallback(() => {
    // A pending permission prompt must not leave a capture starting after teardown.
    micInitInFlightRef.current = false;
    if (audioProcessorRef.current) {
      try {
        if ('onaudioprocess' in audioProcessorRef.current) {
          (audioProcessorRef.current as ScriptProcessorNode).onaudioprocess = null;
        }
        if ('port' in audioProcessorRef.current) {
          (audioProcessorRef.current as AudioWorkletNode).port.onmessage = null;
          (audioProcessorRef.current as AudioWorkletNode).port.close();
        }
        audioProcessorRef.current.disconnect();
      } catch (_) {}
      audioProcessorRef.current = null;
    }
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch (_) {}
      micSourceRef.current = null;
    }
    if (micAnalyserRef.current) {
      try {
        micAnalyserRef.current.disconnect();
      } catch (_) {}
      micAnalyserRef.current = null;
    }
    if (silentSinkRef.current) {
      try {
        silentSinkRef.current.disconnect();
      } catch (_) {}
      silentSinkRef.current = null;
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch (_) {}
      mediaStreamRef.current = null;
    }
    depsRef.current.setAudioState((prev) => ({ ...prev, input: 'UNKNOWN' }));
  }, []);

  const startMicCapture = useCallback(
    async (context: SessionContext) => {
      const d = depsRef.current;
      if (!d.isSessionStillActive(context)) return;

      // Single-flight: a second concurrent call must not trigger a second permission prompt
      // or a second MediaStream. This previously produced two live microphone captures.
      if (micInitInFlightRef.current) {
        console.log('[Mic] Acquisition already in progress; ignoring duplicate request.');
        return;
      }
      if (mediaStreamRef.current && audioProcessorRef.current) {
        console.log('[Mic] Capture already active; ignoring duplicate request.');
        return;
      }

      micInitInFlightRef.current = true;
      d.setMicError(null);
      d.setAudioState((prev) => ({ ...prev, input: 'REQUESTING_PERMISSION' }));

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Browser audio recording is not supported in this environment.');
        }

        stopMicCapture();
        micInitInFlightRef.current = true;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        // The caller may have hung up or switched persona while the permission prompt was up.
        // The tracks are stopped here rather than left open, which used to leave the browser's
        // recording indicator on after the call had ended.
        if (!d.isSessionStillActive(context)) {
          stream.getTracks().forEach((t) => t.stop());
          micInitInFlightRef.current = false;
          return;
        }

        mediaStreamRef.current = stream;
        d.setAudioState((prev) => ({ ...prev, input: 'READY' }));

        const inputCtx = getInputAudioContext();
        if (inputCtx.state === 'suspended') {
          await inputCtx.resume();
        }

        const source = inputCtx.createMediaStreamSource(stream);
        const micAnalyser = inputCtx.createAnalyser();
        micAnalyser.fftSize = 128;
        source.connect(micAnalyser);

        // Silent destination: required to pull the processor, must not be audible.
        const sink = createSilentSink(inputCtx);
        silentSinkRef.current = sink;

        let pcmChunks: Int16Array[] = [];
        let accumulatedSamples = 0;

        const processAudioChunk = (inputData: Float32Array) => {
          const live = depsRef.current;
          if (!live.isSessionStillActive(context)) return;
          if (live.isMicMuted || live.isTurnFrozen()) return;

          const ws = live.wsRef.current;
          if (!ws || ws.readyState !== WebSocket.OPEN) return;

          let sumSq = 0;
          for (let i = 0; i < inputData.length; i++) {
            sumSq += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sumSq / inputData.length);

          if (rms > VOICE_RMS_THRESHOLD) {
            live.onVoiceActivity();
          }

          if (!live.isPlayingRef.current) {
            live.publishMicAnalyser(micAnalyser);
          }

          pcmChunks.push(new Int16Array(float32ToInt16PCM(inputData)));
          accumulatedSamples += pcmChunks[pcmChunks.length - 1].length;

          if (accumulatedSamples < FRAME_SAMPLES) return;

          const mergedPCM = new Int16Array(accumulatedSamples);
          let offset = 0;
          for (const chunk of pcmChunks) {
            mergedPCM.set(chunk, offset);
            offset += chunk.length;
          }
          pcmChunks = [];
          accumulatedSamples = 0;

          // Echo suppression: never send caller audio while the agent is speaking, unless the
          // signal is loud enough to be the caller interrupting.
          if (live.isPlayingRef.current && rms < ECHO_RMS_THRESHOLD) return;

          try {
            const current = live.wsRef.current;
            if (current && current.readyState === WebSocket.OPEN) {
              current.send(
                JSON.stringify({ type: 'realtime_input', pcmBase64: arrayBufferToBase64(mergedPCM.buffer) })
              );
              live.onAudioSent();
            }
          } catch (_) {}
        };

        const workletReady = await ensureWorkletLoaded(inputCtx);
        if (workletReady) {
          const workletNode = new AudioWorkletNode(inputCtx, 'aura-mic-processor');
          workletNode.port.onmessage = (e) => {
            if (e.data instanceof Float32Array || ArrayBuffer.isView(e.data)) {
              processAudioChunk(e.data as Float32Array);
            }
          };
          source.connect(workletNode);
          workletNode.connect(sink);
          audioProcessorRef.current = workletNode;
        } else {
          const processor = inputCtx.createScriptProcessor(1024, 1, 1);
          processor.onaudioprocess = (e) => {
            processAudioChunk(e.inputBuffer.getChannelData(0));
          };
          source.connect(processor);
          processor.connect(sink);
          audioProcessorRef.current = processor;
        }

        micSourceRef.current = source;
        micAnalyserRef.current = micAnalyser;
        micInitInFlightRef.current = false;
        d.setMicError(null);
      } catch (err: any) {
        micInitInFlightRef.current = false;
        console.warn('Microphone access warning:', err.message || err);
        const isDenied =
          err.name === 'NotAllowedError' ||
          err.name === 'PermissionDeniedError' ||
          String(err).toLowerCase().includes('denied');
        d.setMicError(
          isDenied
            ? 'Microphone permission was denied by browser. You can still type prompts or click "Retry Mic" once allowed.'
            : err.message || 'Microphone access is unavailable.'
        );
        d.setAudioState((prev) => ({ ...prev, input: 'BLOCKED' }));
      }
    },
    [stopMicCapture]
  );

  return {
    startMicCapture,
    stopMicCapture,
    micAnalyserRef,
    /** True while a stream is live, so the handshake does not start a second capture. */
    hasLiveStream: () => mediaStreamRef.current !== null && audioProcessorRef.current !== null,
  };
}
