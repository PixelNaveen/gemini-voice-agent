import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';
import http from 'http';
import type { AddressInfo } from 'net';
import path from 'path';
import { WebSocket } from 'ws';

/**
 * SECTION 13: Live relay security gate integration check.
 *
 * The origin and token checks are unit-tested in isolation, which is not sufficient. The
 * original implementation registered `wss.on('upgrade', guard)` while ALSO passing
 * `{ server: httpServer }` to the WebSocketServer. In that configuration the `ws` library
 * attaches its own `upgrade` listener to the HTTP server and never re-emits `upgrade` on
 * the WebSocketServer, so the guard was dead code and every cross-origin, token-less
 * connection was accepted. Unit tests could never have caught that; only a real socket
 * handshake does.
 *
 * This script boots the real server, performs real WebSocket handshakes, and asserts the
 * observable HTTP status. Run with: npm run verify:relay
 */

const PORT = Number(process.env.VERIFY_PORT || 4123);
const TOKEN = 'verify-relay-shared-secret-token';

/**
 * A stand-in for the provider's credential endpoint.
 *
 * Readiness verifies the Gemini credential for real, which is what stops it reporting
 * `HEALTHY` for a revoked key. That is exactly the check this harness cannot perform with the
 * dummy key it deliberately injects, so the probe endpoint is pointed at a local stub instead.
 * Both branches are exercised - accept and reject - so the readiness logic is covered for
 * real without a credential or any quota spend.
 */
function startCredentialStub(mode: 'accept' | 'reject'): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    if (mode === 'accept') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ models: [] }));
      return;
    }
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'API key not valid' } }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/v1beta/models`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

interface Check {
  label: string;
  headers: Record<string, string>;
  path?: string;
  expect: 'UPGRADED' | number;
}

function handshake(check: Check): Promise<{ outcome: string; ok: boolean }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}${check.path ?? '/live'}`, { headers: check.headers });
    let settled = false;
    const done = (outcome: string, ok: boolean) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      resolve({ outcome, ok });
    };
    ws.on('unexpected-response', (_req, res) => done(`HTTP ${res.statusCode}`, check.expect === res.statusCode));
    ws.on('open', () => done('UPGRADED', check.expect === 'UPGRADED'));
    ws.on('error', () => done('error', false));
    setTimeout(() => done('timeout', false), 8000);
  });
}

async function waitForBoot(proc: ChildProcessWithoutNullStreams): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 45_000);
    const onData = (buf: Buffer) => {
      if (buf.toString().includes('Server listening')) {
        clearTimeout(timer);
        proc.stdout.off('data', onData);
        resolve(true);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
  });
}

/**
 * Spawns the server with the current Node binary and the locally installed tsx CLI.
 * Using `npx` directly fails on Windows, where it is a shell script rather than an
 * executable, so the local module path is resolved explicitly.
 */
function serverCommand(): { command: string; args: string[] } {
  const localTsx = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (existsSync(localTsx)) {
    return { command: process.execPath, args: [localTsx, 'server.ts'] };
  }
  return { command: 'npx', args: ['tsx', 'server.ts'] };
}

async function main(): Promise<void> {
  const checks: Check[] = [
    {
      label: 'cross-origin upgrade is rejected',
      headers: { Origin: 'https://evil.example.com', 'x-aura-live-token': TOKEN },
      expect: 401,
    },
    {
      label: 'missing Origin is rejected (no browser, no token)',
      headers: {},
      expect: 401,
    },
    {
      label: 'same-origin without a token is rejected',
      headers: { Origin: `http://127.0.0.1:${PORT}` },
      expect: 401,
    },
    {
      label: 'same-origin with a wrong token is rejected',
      headers: { Origin: `http://127.0.0.1:${PORT}`, 'x-aura-live-token': 'wrong-token-entirely' },
      expect: 401,
    },
    {
      label: 'same-origin with the correct token header is accepted',
      headers: { Origin: `http://127.0.0.1:${PORT}`, 'x-aura-live-token': TOKEN },
      expect: 'UPGRADED',
    },
    {
      label: 'same-origin with the correct HttpOnly cookie is accepted (browser path)',
      headers: { Origin: `http://127.0.0.1:${PORT}`, Cookie: `aura_live=${TOKEN}` },
      expect: 'UPGRADED',
    },
    {
      label: 'a cookie for a different secret is rejected',
      headers: { Origin: `http://127.0.0.1:${PORT}`, Cookie: 'aura_live=not-the-real-token' },
      expect: 401,
    },
    {
      label: 'the hardened __Host- cookie name is also accepted (https deployments)',
      headers: { Origin: `http://127.0.0.1:${PORT}`, Cookie: `__Host-aura_live=${TOKEN}` },
      expect: 'UPGRADED',
    },
    {
      label: 'an unknown path is not handled by the relay',
      headers: { Origin: `http://127.0.0.1:${PORT}`, 'x-aura-live-token': TOKEN },
      path: '/not-the-relay',
      expect: 404,
    },
  ];

  const { command, args } = serverCommand();
  // The stub answers the credential probe, so `/ready` can reach 200 with the dummy key this
  // harness deliberately injects - without weakening the check the server actually performs.
  const acceptingStub = await startCredentialStub('accept');
  const proc = spawn(command, args, {
    env: {
      ...process.env,
      GEMINI_API_KEY: 'verify-boot-only-dummy-key',
      AURA_CREDENTIAL_PROBE_URL: acceptingStub.url,
      NODE_ENV: 'production',
      PORT: String(PORT),
      AURA_LIVE_TOKEN: TOKEN,
    },
    stdio: 'pipe',
  });

  let failures = 0;
  try {
    const booted = await waitForBoot(proc);
    if (!booted) {
      console.error('[verify:relay] Server did not boot within 45s.');
      process.exitCode = 1;
      return;
    }

    console.log('\n[verify:relay] Live relay security gate\n');
    for (const check of checks) {
      const { outcome, ok } = await handshake(check);
      if (ok) {
        console.log(`  [PASS] ${check.label} -> ${outcome}`);
      } else {
        failures++;
        console.log(`  [FAIL] ${check.label} -> ${outcome} (expected ${check.expect})`);
      }
    }

  // SECTION 11: the diagnostic routes and the TTS proxies must reject anonymous callers.
  // These are plain HTTP requests, not upgrades, so they need their own assertions.
  const httpChecks: Array<{ label: string; path: string; method: 'GET' | 'POST'; body?: unknown; origin: string; cred?: string; expect: number }> = [
    { label: 'anonymous prompt preview is rejected (leaks the whole system prompt)', path: '/api/prompt-preview', method: 'GET', origin: 'https://evil.example.com', expect: 401 },
    { label: 'anonymous metrics are rejected', path: '/api/metrics', method: 'GET', origin: 'https://evil.example.com', expect: 401 },
    { label: 'anonymous session registry is rejected', path: '/api/sessions', method: 'GET', origin: 'https://evil.example.com', expect: 401 },
    { label: 'anonymous TTS synthesis is rejected (spends the Gemini key)', path: '/api/tts', method: 'POST', body: { text: 'spend some quota' }, origin: 'https://evil.example.com', expect: 401 },
    { label: 'anonymous greeting synthesis is rejected', path: '/api/greeting', method: 'POST', body: {}, origin: 'https://evil.example.com', expect: 401 },
    { label: 'credentialed prompt preview is allowed for operators', path: '/api/prompt-preview', method: 'GET', origin: `http://127.0.0.1:${PORT}`, cred: TOKEN, expect: 200 },
    { label: 'health stays public for orchestrators', path: '/health', method: 'GET', origin: 'https://anywhere.example.com', expect: 200 },
    { label: 'readiness is public so orchestrators can gate traffic on it', path: '/ready', method: 'GET', origin: 'https://anywhere.example.com', expect: 200 },
  ];

  console.log('\n[verify:relay] Diagnostic and TTS route authorization\n');
  for (const check of httpChecks) {
    const headers: Record<string, string> = { Origin: check.origin, 'Content-Type': 'application/json' };
    if (check.cred) headers['x-aura-live-token'] = check.cred;
    const res = await fetch(`http://127.0.0.1:${PORT}${check.path}`, {
      method: check.method,
      headers,
      ...(check.body === undefined ? {} : { body: JSON.stringify(check.body) }),
    });
    const ok = res.status === check.expect;
    if (ok) {
      console.log(`  [PASS] ${check.label} -> HTTP ${res.status}`);
    } else {
      failures++;
      console.log(`  [FAIL] ${check.label} -> HTTP ${res.status} (expected ${check.expect})`);
    }
    void res.body?.cancel();
  }

  // Readiness is a separate, public gate: it must report honestly whether this instance can
  // keep a booking, and it must not leak internal dependency detail to an anonymous caller.
  // Only the boolean verdict is asserted here; the per-dependency payload stays operator-grade.
  try {
    const readyRes = await fetch(`http://127.0.0.1:${PORT}/ready`, {
      method: 'GET',
      headers: { Origin: 'https://anywhere.example.com' },
    });
    const readyBody: any = await readyRes.json().catch(() => null);
    if (readyRes.status === 200 || readyRes.status === 503) {
      console.log(`  [PASS] readiness returns a real verdict -> HTTP ${readyRes.status}`);
    } else {
      failures++;
      console.log(`  [FAIL] readiness must answer 200 or 503, got HTTP ${readyRes.status}`);
    }
    if (readyBody && typeof readyBody.ready === 'boolean') {
      console.log('  [PASS] readiness reports a boolean verdict rather than an assumed "ok"');
    } else {
      failures++;
      console.log('  [FAIL] readiness must report a boolean `ready` field');
    }
    if (readyBody && !JSON.stringify(readyBody).includes('journal unreadable')) {
      console.log('  [PASS] readiness does not leak internal failure detail to an anonymous caller');
    } else if (readyBody) {
      failures++;
      console.log('  [FAIL] readiness leaked internal dependency detail');
    }
    if (readyBody && readyBody.dependencies === undefined) {
      console.log('  [PASS] readiness withholds dependency detail from an unauthenticated caller');
    } else if (readyBody) {
      failures++;
      console.log('  [FAIL] readiness returned dependency detail to an unauthenticated caller');
    }

    // F-20/F-11: the local journal is durable but instance-local. A many-instance deployment
    // can double-book the same slot, so readiness must state the topology. This check exists so
    // the warning cannot be quietly removed along with the rest of the honesty work.
    const topology = readyBody?.persistence?.topology;
    const declaredShared = readyBody?.persistence?.shared;
    if (topology === 'SINGLE_INSTANCE' || topology === 'MULTI_INSTANCE_RISK') {
      console.log(`  [PASS] readiness states the persistence topology -> ${topology}`);
    } else {
      failures++;
      console.log('  [FAIL] readiness must state the persistence topology so an operator can see it');
    }
    if (declaredShared === false) {
      console.log('  [PASS] readiness does not claim shared persistence it does not have');
    } else {
      failures++;
      console.log('  [FAIL] readiness must not report `shared: true` without a shared store');
    }
  } catch (err: any) {
    failures++;
    console.log(`  [FAIL] readiness probe could not run: ${err?.message}`);
  }

  // ── The rejection branch, which is the check that gives the acceptance one its meaning ──
  //
  // A readiness gate that only ever sees a working credential proves nothing. This asserts the
  // server refuses to route traffic when the provider rejects the credential, which is the
  // specific dishonesty that "has a key string, therefore healthy" allowed: an instance with a
  // revoked key reporting ready and then failing every call it is given.
  {
    const rejectingStub = await startCredentialStub('reject');
    const { command: cmd2, args: args2 } = serverCommand();
    const proc2 = spawn(cmd2, args2, {
      env: {
        ...process.env,
        GEMINI_API_KEY: 'verify-boot-only-dummy-key',
        AURA_CREDENTIAL_PROBE_URL: rejectingStub.url,
        NODE_ENV: 'production',
        PORT: String(PORT + 1),
        AURA_LIVE_TOKEN: TOKEN,
      },
      stdio: 'pipe',
    });
    try {
      const booted = await waitForBoot(proc2);
      if (!booted) {
        failures++;
        console.log('  [FAIL] the rejected-credential instance did not boot');
      } else {
        const res = await fetch(`http://127.0.0.1:${PORT + 1}/ready`);
        const body = (await res.json().catch(() => null)) as any;
        if (res.status === 503 && body?.ready === false) {
          console.log('  [PASS] readiness refuses traffic when the provider rejects the credential');
        } else {
          failures++;
          console.log(
            `  [FAIL] a rejected credential must yield 503/ready:false, got HTTP ${res.status} ready=${body?.ready}`
          );
        }
      }
    } finally {
      proc2.kill();
      await rejectingStub.close();
    }
  }

  // SECTION 13: the browser must be able to obtain the cookie in the first place, and the
  // response must not hand the secret back to page JavaScript.
  const bootstrapChecks = await verifyBootstrap();
  for (const line of bootstrapChecks) {
    if (line.startsWith('  [FAIL]')) failures++;
    console.log(line);
  }
  } finally {
    proc.kill();
    await acceptingStub.close();
  }

  if (failures > 0) {
    console.error(`\n[verify:relay] ${failures} check(s) failed.\n`);
    process.exitCode = 1;
  } else {
    console.log(`\n[verify:relay] All relay security checks passed.\n`);
  }
}

/**
 * Verifies the token bootstrap endpoint the browser depends on: that it refuses a foreign
 * origin, that it sets a properly hardened cookie, and that it never returns the secret in
 * the response body where an injected script could read it.
 */
async function verifyBootstrap(): Promise<string[]> {
  const out: string[] = [];
  const base = `http://127.0.0.1:${PORT}/api/live-token`;

  const foreign = await fetch(base, { headers: { Origin: 'https://evil.example.com' } });
  out.push(
    foreign.status === 403
      ? '  [PASS] token bootstrap refuses a foreign origin -> HTTP 403'
      : `  [FAIL] token bootstrap refused foreign origin -> expected 403, got ${foreign.status}`
  );

  const good = await fetch(base, { headers: { Origin: `http://127.0.0.1:${PORT}` } });
  const setCookie = good.headers.get('set-cookie') ?? '';
  const body = await good.text();

  const hasCookie = setCookie.includes('aura_live=');
  out.push(
    good.status === 200 && hasCookie
      ? '  [PASS] token bootstrap sets the relay cookie for a same-origin request'
      : `  [FAIL] token bootstrap set-cookie (status ${good.status}, cookie: ${setCookie || 'none'})`
  );
  out.push(
    setCookie.includes('HttpOnly')
      ? '  [PASS] relay cookie is HttpOnly (unreadable by page scripts)'
      : '  [FAIL] relay cookie is not HttpOnly'
  );
  out.push(
    /SameSite=Strict/i.test(setCookie)
      ? '  [PASS] relay cookie is SameSite=Strict (not sent cross-site)'
      : '  [FAIL] relay cookie is not SameSite=Strict'
  );
  out.push(
    !body.includes(TOKEN)
      ? '  [PASS] bootstrap response body does not contain the secret'
      : '  [FAIL] bootstrap response body LEAKS the secret to page JavaScript'
  );

  return out;
}

void main();
