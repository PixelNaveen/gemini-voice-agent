/**
 * Audio processing utilities for PCM conversion, WebAudio decoding, pitch-preserving
 * time-stretch, and spectral analysis.
 */

// Global AudioContext singletons
let inputAudioCtx: AudioContext | null = null;
let outputAudioCtx: AudioContext | null = null;

export function getOutputAudioContext(): AudioContext {
  if (!outputAudioCtx || outputAudioCtx.state === 'closed') {
    outputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  if (outputAudioCtx.state === 'suspended') {
    void outputAudioCtx.resume();
  }
  return outputAudioCtx;
}

export function getInputAudioContext(): AudioContext {
  if (!inputAudioCtx || inputAudioCtx.state === 'closed') {
    inputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  }
  if (inputAudioCtx.state === 'suspended') {
    void inputAudioCtx.resume();
  }
  return inputAudioCtx;
}

/**
 * Releases the singleton AudioContexts. Called on session teardown so a new call
 * never inherits a suspended or closed context from the previous one.
 */
export async function closeAudioContexts(): Promise<void> {
  const contexts = [inputAudioCtx, outputAudioCtx].filter(Boolean) as AudioContext[];
  inputAudioCtx = null;
  outputAudioCtx = null;
  for (const ctx of contexts) {
    try {
      if (ctx.state !== 'closed') {
        await ctx.close();
      }
    } catch (_) {
      /* context already torn down by the browser */
    }
  }
}

/**
 * Converts Float32 audio samples (-1.0 to 1.0) into 16-bit PCM LE Int16 ArrayBuffer
 */
export function float32ToInt16PCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

/**
 * Encodes ArrayBuffer to Base64 using chunked conversion.
 * A single `String.fromCharCode(...bytes)` blows the argument limit on real audio
 * frames and is a common source of dropped realtime chunks.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Decodes base64 WAV or raw PCM audio string to AudioBuffer.
 * `sampleRate` must describe the provider payload (Gemini Live returns 24 kHz).
 */
export async function decodeAudioBase64(
  base64Data: string,
  ctx: AudioContext,
  sampleRate = 24000
): Promise<AudioBuffer> {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // WAV container: must retain the exact byte length of the RIFF payload.
  if (len >= 44 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return await ctx.decodeAudioData(bytes.buffer.slice(0, len));
  }

  // Raw interleaved-free mono PCM16.
  const usableLength = len - (len % 2);
  const int16 = new Int16Array(usableLength / 2);
  const view = new DataView(bytes.buffer, 0, usableLength);
  for (let i = 0; i < int16.length; i++) {
    int16[i] = view.getInt16(i * 2, true);
  }
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }

  const audioBuffer = ctx.createBuffer(1, Math.max(float32.length, 1), sampleRate);
  audioBuffer.getChannelData(0).set(float32);
  return audioBuffer;
}

const MAX_GRAIN = 1024; // analysis window at full size (~43ms at 24kHz)
const MIN_GRAIN = 512; // a grain shorter than this cannot hold the pitch it has to preserve
const MAX_CORRELATE = 256; // cap the search cost on long buffers

function largestPowerOfTwoAtMost(value: number): number {
  return 1 << (31 - Math.clz32(value));
}

/**
 * WSOLA (Waveform Similarity Overlap-Add) time-stretch.
 *
 * `AudioBufferSourceNode.playbackRate` changes duration AND pitch together, so using it
 * to "speed up" the agent makes the voice chipmunk. WSOLA re-times the waveform while
 * reconstructing each grain from the region that best matches the previous grain's tail,
 * which preserves pitch.
 *
 * The synthesis hop is fixed and drives the analysis pointer backwards
 * (`analysisPos = synthPos / rate`), so the output length follows from the requested
 * rate instead of accumulating whatever the search happened to pick. Letting the
 * analysis pointer advance at its own fixed hop instead — the obvious first
 * implementation — leaves the result several percent long, and misses the rate
 * entirely for the short chunks a live stream is made of.
 *
 * Grain size follows the buffer. A fixed 1024-sample window needs roughly 1.3k samples
 * before it can emit even one grain, which is far more than a live streaming chunk
 * carries, so the fixed version returned an all-zero buffer — audible silence — for
 * every short chunk, and ignored the requested rate for the ones below the window.
 * Grains stay at or above MIN_GRAIN even when that means only a couple of them fit,
 * because a grain shorter than a couple of voice periods cannot preserve a pitch and
 * the whole reason for doing this instead of resampling is the pitch.
 *
 * @param input  mono samples
 * @param rate   >1 makes the result shorter/faster, <1 longer/slower, 1 is a copy
 */
export function timeStretch(input: Float32Array, rate: number): Float32Array {
  if (!Number.isFinite(rate) || rate <= 0) {
    return input;
  }
  if (Math.abs(rate - 1) < 1e-3) {
    return input;
  }
  // Two grains have to fit, and neither may drop below MIN_GRAIN.
  if (input.length < MIN_GRAIN * 2) {
    return input;
  }

  // Aim for at least four grains so the synthesis hop quantises the output length finely;
  // MIN_GRAIN still wins where the buffer is too short for that, and the length guard
  // above keeps the result at or below half the buffer either way.
  const grain = Math.max(
    MIN_GRAIN,
    Math.min(MAX_GRAIN, largestPowerOfTwoAtMost(Math.floor(input.length / 4)))
  );
  const search = grain >> 2; // +/- cross-correlation search radius
  // At rate = 1 the grains are laid down back to back; every other rate scales the hop,
  // which is what re-times the signal without resampling it. Clamped so two grains
  // always share at least one sample.
  const synthHop = Math.max(1, Math.min(grain - 1, Math.round((grain >> 1) * rate)));
  // A grain starts `synthHop` samples into the overlap with its predecessor, so that is
  // where the previous grain's tail begins and how long the new grain's head has to be
  // for the seam to disappear. Anchoring this at a fixed half-grain instead is only
  // correct at rate = 1, and detunes every slower setting.
  const correlate = Math.min(grain - synthHop, MAX_CORRELATE);
  const lastStart = input.length - grain;

  const outLength = Math.max(grain, Math.floor(input.length / rate));
  const grainCount = Math.max(1, Math.round((outLength - grain) / synthHop) + 1);
  const written = Math.min(outLength + grain, (grainCount - 1) * synthHop + grain);

  const output = new Float32Array(written);
  const norm = new Float32Array(written);
  const window = new Float32Array(grain);
  for (let i = 0; i < grain; i++) {
    // Hann window: smooths the overlap-add seams, and tapers the final grain to silence.
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (grain - 1));
  }

  let synthPos = 0;
  let prevTail: Float32Array | null = null;

  for (let n = 0; n < grainCount; n++) {
    const nominal = Math.min(lastStart, Math.max(0, Math.round(synthPos / rate)));
    let bestOffset = 0;
    let bestScore = -Infinity;

    if (prevTail) {
      // Find the analysis frame within +/- search that best continues the previous tail.
      const firstOffset = Math.max(-search, -nominal);
      const lastOffset = Math.min(search, lastStart - nominal);
      for (let d = firstOffset; d <= lastOffset; d++) {
        let score = 0;
        for (let i = 0; i < correlate; i += 4) {
          score += prevTail[i] * input[nominal + d + i];
        }
        if (score > bestScore) {
          bestScore = score;
          bestOffset = d;
        }
      }
    }

    const grainStart = nominal + bestOffset;
    const count = Math.min(grain, written - synthPos);
    for (let i = 0; i < count; i++) {
      output[synthPos + i] += input[grainStart + i] * window[i];
      norm[synthPos + i] += window[i];
    }

    // Retain this frame's tail for the next correlation pass.
    prevTail = input.subarray(grainStart + synthHop, grainStart + synthHop + correlate);
    synthPos += synthHop;
  }

  for (let i = 0; i < written; i++) {
    if (norm[i] > 1e-6) {
      output[i] /= norm[i];
    }
  }
  return output;
}

/**
 * Plays an AudioBuffer, optionally speed-adjusted WITHOUT changing pitch.
 * Returns the source (for interruption) and an AnalyserNode for visualizer feedback.
 */
export function playAudioBuffer(
  ctx: AudioContext,
  buffer: AudioBuffer,
  onEnded?: () => void,
  speed: number = 1.0
): { source: AudioBufferSourceNode; analyser: AnalyserNode; rate: number } {
  let playable = buffer;

  if (Number.isFinite(speed) && speed > 0 && Math.abs(speed - 1) > 1e-3) {
    const stretched = timeStretch(buffer.getChannelData(0), speed);
    // A fragment with no room for even one overlap-add pair comes back untouched and is
    // played at its native rate: resampling it would trade a correct duration for a pitch
    // artefact on a few milliseconds of audio.
    if (stretched.length > 0 && stretched.length !== buffer.length) {
      playable = ctx.createBuffer(1, stretched.length, buffer.sampleRate);
      playable.getChannelData(0).set(stretched);
    }
  }

  const source = ctx.createBufferSource();
  source.buffer = playable;
  // Always 1.0: the requested speed is already baked into the buffer's length by
  // timeStretch, and any resampling here would put the pitch back the way it was.
  source.playbackRate.value = 1.0;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 128;
  analyser.smoothingTimeConstant = 0.8;

  source.connect(analyser);
  analyser.connect(ctx.destination);

  if (onEnded) {
    source.onended = onEnded;
  }

  source.start(0);
  return { source, analyser, rate: 1.0 };
}

/**
 * Creates a zero-gain sink.
 * A ScriptProcessorNode MUST be connected to a destination to be pulled by the audio
 * graph. Connecting the microphone straight to `ctx.destination` plays caller audio out
 * of the speakers and feeds back; a muted sink keeps the graph running silently.
 */
export function createSilentSink(ctx: AudioContext): GainNode {
  const sink = ctx.createGain();
  sink.gain.value = 0;
  sink.connect(ctx.destination);
  return sink;
}

/**
 * Calculates root-mean-square audio volume from audio frequency byte data (0-255)
 */
export function calculateAudioLevel(dataArray: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const val = dataArray[i] / 255.0;
    sum += val * val;
  }
  return Math.sqrt(sum / dataArray.length);
}
