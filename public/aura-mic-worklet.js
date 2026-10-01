/**
 * AURA microphone capture worklet.
 *
 * Why this is a real file rather than a `Blob` URL built at runtime:
 * `AudioWorklet.addModule(blob:...)` is subject to the page's `script-src` CSP directive. The
 * shipped policy does not allow `blob:` in `script-src` - deliberately, since it is a well-known
 * script-injection sink - so the browser refused to load a worklet that the application
 * considered mandatory. Because the load failure was swallowed by a bare `catch`, the only
 * visible symptom was the browser falling back to `ScriptProcessorNode` and logging
 * "ScriptProcessorNode is deprecated". The worklet was silently never running.
 *
 * A same-origin file needs no CSP exception, is served from the app's own origin, is cached by
 * the browser, and behaves identically in development and production.
 *
 * AudioWorklet global scope: `AudioWorkletProcessor` and `registerProcessor` are provided by the
 * audio rendering thread, not by `window`, so this file has no imports and must stay standalone.
 */
class AuraMicProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    // `input[0]` is a Float32Array of mono samples for the current render quantum. It is
    // transferred rather than copied, so the host resamples/encodes on its own thread and the
    // audio thread is never blocked by the network send.
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage(input[0]);
    }
    // `true` keeps the node alive for the lifetime of the stream. Returning false would stop
    // processing and silently end the caller's microphone.
    return true;
  }
}

registerProcessor('aura-mic-processor', AuraMicProcessor);
