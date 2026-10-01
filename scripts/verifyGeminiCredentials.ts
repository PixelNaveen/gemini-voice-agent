/**
 * Live credential smoke test.
 *
 * Verifies the configured AQ. authorization key against the real Gemini API, using the same
 * SDK and the same model identifier the relay uses. Run with: npm run verify:gemini
 *
 * This is intentionally read-only and cheap: a single short generateContent call against a
 * non-live model, to prove the key, the model name, and the SDK are all mutually valid
 * before anyone tries to open a websocket.
 */
import { GoogleGenAI, Modality } from '@google/genai';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

function readKey(): string {
  // Load .env / .env.local without adding a dependency.
  for (const file of ['.env.local', '.env']) {
    const full = path.resolve(process.cwd(), file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && m[1] === 'GEMINI_API_KEY' && !process.env.GEMINI_API_KEY) {
        process.env.GEMINI_API_KEY = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  return (process.env.GEMINI_API_KEY || '').trim();
}

/**
 * The Gemini API returns 503 UNAVAILABLE under load spikes. That is a transient provider
 * condition, not a defect in this project, so a verification run must not report it as a
 * broken configuration. Retry a few times before giving up.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = String((err as { message?: string })?.message ?? err);
      const transient = /UNAVAILABLE|503|high demand|overloaded|rate limit|429/i.test(message);
      if (!transient || i === attempts - 1) throw err;
      const waitMs = 2000 * (i + 1);
      console.log(`  (transient provider error, retrying in ${waitMs}ms: ${message.slice(0, 80)})`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}

/**
 * Opens a real Gemini Live session and waits for the provider's setupComplete, which is the
 * first point at which the session can accept input. Mirrors the relay's own handshake so a
 * pass here means the relay's connect path is sound.
 */
async function probeLiveSession(
  client: GoogleGenAI,
  model: string
): Promise<{ ok: boolean; reason?: string; ms?: number }> {
  const started = Date.now();
  const SETUP_TIMEOUT_MS = 20_000;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean, reason?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, reason, ms: Date.now() - started });
    };

    const timer = setTimeout(
      () => finish(false, `no setupComplete within ${SETUP_TIMEOUT_MS}ms`),
      SETUP_TIMEOUT_MS
    );

    void client.live
      .connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {},
          onmessage: (msg: unknown) => {
            if ((msg as { setupComplete?: unknown })?.setupComplete) {
              finish(true);
            }
          },
          onerror: (e: unknown) => finish(false, String((e as Error)?.message ?? e)),
          onclose: () => finish(false, 'session closed before setup completed'),
        },
      })
      .then((session) => {
        // Close promptly: this probe verifies the handshake, it is not a conversation.
        setTimeout(() => {
          try {
            const closer = session?.close?.() as unknown;
            if (closer && typeof (closer as Promise<void>).catch === 'function') {
              (closer as Promise<void>).catch(() => {});
            }
          } catch {
            /* the probe already has its answer */
          }
        }, 100);
      })
      .catch((err: unknown) => finish(false, String((err as Error)?.message ?? err)));
  });
}

async function main(): Promise<void> {
  const apiKey = readKey();
  if (!apiKey) {
    console.error('[verify:gemini] GEMINI_API_KEY is not set. Cannot verify.');
    process.exitCode = 1;
    return;
  }

  // Never print the credential itself, only enough to tell the two apart.
  const shape = `${apiKey.slice(0, 3)}${'*'.repeat(Math.max(0, apiKey.length - 3))}`;
  console.log(`[verify:gemini] Testing key ${shape} (${apiKey.length} chars)`);

  const client = new GoogleGenAI({ apiKey });
  const liveModel = process.env.AURA_LIVE_MODEL || 'gemini-3.8-live';
  const probeModel = process.env.AURA_PROBE_MODEL || 'gemini-3.8-flash';

  let failed = false;

  // 1. Does the key authenticate at all? Use a cheap, non-live model.
  console.log(`\n[verify:gemini] 1/3 generateContent with ${probeModel}`);
  try {
    const text = await withRetry(
      () =>
        client.models
          .generateContent({
            model: probeModel,
            contents: 'Reply with exactly: OK',
            config: { maxOutputTokens: 8 },
          })
          .then((r) => r.text?.trim() ?? ''),
      3
    );
    console.log(`  [PASS] authenticated. Response: ${JSON.stringify(text.slice(0, 40))}`);
  } catch (err) {
    failed = true;
    const e = err as { message?: string; status?: number };
    const detail = `${e.status ?? ''} ${e.message ?? err}`;
    // A 404 means the key authenticated fine and only the model name was wrong. Reporting
    // that as "the key was rejected" would send someone to rotate a perfectly good key.
    const isAuthError = /API key not valid|API_KEY_INVALID|401|403|PERMISSION_DENIED|UNAUTHENTICATED/i.test(
      detail
    );
    if (isAuthError) {
      console.error(`  [FAIL] ${detail}`);
      console.error('  The key itself was rejected. Do not continue to websocket testing.');
    } else {
      console.error(`  [FAIL] ${detail}`);
      console.error(
        '  The key AUTHENTICATED (this is not an auth error), but the probe model was ' +
          'unavailable. Fix the model id, then re-run.'
      );
    }
    process.exitCode = 1;
    return;
  }

  // 2. The live model cannot be probed with generateContent at all: it only accepts
  //    bidirectional streaming over a WebSocket, and answers generateContent with
  //    INVALID_ARGUMENT. Probing it that way produces a confusing failure that looks like a
  //    bad model id when the id is in fact correct. So open a real Live session, which is
  //    the same code path the relay uses, and wait for the provider's setupComplete.
  console.log(`\n[verify:gemini] 2/3 live model "${liveModel}" over a real WebSocket session`);
  try {
    const liveResult = await probeLiveSession(client, liveModel);
    if (liveResult.ok) {
      console.log(`  [PASS] Live session established (setupComplete in ${liveResult.ms}ms).`);
    } else {
      failed = true;
      console.error(`  [FAIL] Live session failed: ${liveResult.reason}`);
    }
  } catch (err) {
    failed = true;
    const e = err as { message?: string; status?: number };
    console.error(`  [FAIL] ${e.status ?? ''} ${e.message ?? err}`);
  }

  // 3. Is the TTS model real? /api/tts returns an honest 503 if it is not, but only
  //    discoverable by a caller, so check it here.
  const ttsModel = process.env.AURA_TTS_MODEL || 'gemini-3.8-flash-lite-tts';
  console.log(`\n[verify:gemini] 3/3 TTS model "${ttsModel}" reachability`);
  try {
    const res = await client.models.generateContent({
      model: ttsModel,
      contents: 'Hello.',
      config: { responseModalities: [Modality.AUDIO], maxOutputTokens: 32 },
    });
    const hasAudio =
      (res.candidates?.[0]?.content?.parts ?? []).some((p) => p.inlineData?.data);
    if (hasAudio) {
      console.log('  [PASS] TTS model returned audio.');
    } else {
      failed = true;
      console.error('  [FAIL] TTS model returned no audio data.');
    }
  } catch (err) {
    failed = true;
    const e = err as { message?: string; status?: number };
    console.error(`  [FAIL] ${e.status ?? ''} ${e.message ?? err}`);
  }

  console.log(
    failed
      ? '\n[verify:gemini] One or more checks FAILED. See above.\n'
      : '\n[verify:gemini] All checks passed.\n'
  );
  if (failed) process.exitCode = 1;
}

void main();
