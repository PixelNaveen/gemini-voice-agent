/**
 * Verifies that every configured Gemini credential can actually carry a live voice call.
 *
 * Authenticating against the REST models endpoint is a much weaker guarantee than the one
 * this application depends on. A key can list models while the Live API is not enabled for
 * its project, in which case the relay fails at websocket-connect time and every caller hears
 * silence. With multiple credentials across separate accounts, it also matters whether every
 * one of them is genuinely usable, because the pool will route to any of them.
 *
 * Each key therefore gets a real bidirectional WebSocket session, which is the only thing
 * that proves it can serve traffic.
 *
 * Run with: npm run verify:keys
 */
import { GoogleGenAI, Modality } from '@google/genai';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const LIVE_MODEL = process.env.AURA_LIVE_MODEL || 'gemini-3.8-live';
const SETUP_TIMEOUT_MS = 25_000;

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ['.env.local', '.env']) {
    const full = path.resolve(process.cwd(), f);
    if (!existsSync(full)) continue;
    for (const l of readFileSync(full, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l);
      if (m) out[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

interface Credential {
  label: string;
  key: string;
  id: string;
}

function collectCredentials(env: Record<string, string>): Credential[] {
  const out: Credential[] = [];
  if (env.GEMINI_API_KEY) {
    out.push({ label: 'primary (GEMINI_API_KEY)', key: env.GEMINI_API_KEY, id: 'proj-alpha' });
  }
  for (const name of ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON']) {
    const key = env[`GEMINI_PROJECT_${name}_KEY`];
    if (key && key !== env.GEMINI_API_KEY) {
      out.push({
        label: `${name.toLowerCase()} (GEMINI_PROJECT_${name}_KEY)`,
        key,
        id: env[`GEMINI_PROJECT_${name}_ID`] || name.toLowerCase(),
      });
    }
  }
  return out;
}

async function probeLive(label: string, key: string): Promise<{ ok: boolean; reason: string }> {
  const client = new GoogleGenAI({ apiKey: key });
  const started = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean, reason: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, reason });
    };
    const timer = setTimeout(
      () => finish(false, `no setupComplete within ${SETUP_TIMEOUT_MS}ms`),
      SETUP_TIMEOUT_MS
    );

    void client.live
      .connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (msg: unknown) => {
            if ((msg as { setupComplete?: unknown })?.setupComplete) {
              finish(true, `setupComplete in ${Date.now() - started}ms`);
            }
          },
          onerror: (e: unknown) => finish(false, String((e as Error)?.message ?? e).slice(0, 160)),
          onclose: () => finish(false, 'closed before setup completed'),
        },
      })
      .then((session) => {
        setTimeout(() => {
          try {
            const c = session?.close?.() as unknown;
            if (c && typeof (c as Promise<void>).catch === 'function') {
              (c as Promise<void>).catch(() => {});
            }
          } catch {
            /* already have the answer */
          }
        }, 100);
      })
      .catch((err: unknown) => finish(false, String((err as Error)?.message ?? err).slice(0, 160)));
  });
}

async function main(): Promise<void> {
  const env = loadEnv();
  const creds = collectCredentials(env);

  console.log('\n[verify:keys] Live-API capability per credential\n');

  if (creds.length === 0) {
    console.error('  No Gemini credentials found in .env or the environment.');
    process.exitCode = 1;
    return;
  }

  const usable: Credential[] = [];
  let failed = 0;

  for (const c of creds) {
    const shape = `${c.key.slice(0, 3)}${'*'.repeat(Math.max(0, c.key.length - 3))}`;
    process.stdout.write(`  ${c.label.padEnd(34)} ${shape} ... `);
    const result = await probeLive(c.label, c.key);
    if (result.ok) {
      console.log(`LIVE OK (${result.reason})`);
      usable.push(c);
    } else {
      console.log(`FAILED - ${result.reason}`);
      failed++;
    }
  }

  console.log('\n[verify:keys] Verdict\n');
  console.log(`  ${usable.length} of ${creds.length} credential(s) can serve live traffic.`);
  if (usable.length > 0) {
    const capacity = Number(env.AURA_PROJECT_CAPACITY || 4);
    console.log(`  At AURA_PROJECT_CAPACITY=${capacity}, the pool can admit up to ` +
      `${usable.length * capacity} concurrent sessions.`);
  }
  if (failed > 0) {
    console.log('');
    console.log('  A credential that fails here must be removed from .env. The pool registers it');
    console.log('  as a healthy slot, so the relay will route callers to a key that cannot open a');
    console.log('  session, and they will hear silence rather than an error.');
  }
  console.log('');

  if (usable.length === 0) process.exitCode = 1;
}

void main();
