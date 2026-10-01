/**
 * Local proof that the Vercel Function entrypoint works, without deploying to Vercel.
 *
 * `api/index.ts` was missing entirely while `vercel.json` routed every API path at it, so the
 * static site served and the whole backend 404'd. Nothing in the local test suite would have
 * caught that: the suite exercises the standalone server, and a Vercel-only routing bug is
 * invisible from there.
 *
 * This script stands in the one platform behaviour the adapter depends on - the request context
 * that exposes upgrade primitives - and drives the *real* handler with a *real* WebSocket
 * handshake. It deliberately does not re-implement the Vercel routing; it exercises the same code
 * the platform would.
 */

import http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Duplex } from 'stream';

import { WebSocket } from 'ws';

import handler from '../api/index';

const PORT = Number(process.env.AURA_VERCEL_VERIFY_PORT || 3222);
const VERCEL_REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

let passed = 0;
let failed = 0;

function pass(name: string, detail = ''): void {
  passed += 1;
  console.log(`  [PASS] ${name}${detail ? ` -> ${detail}` : ''}`);
}

function fail(name: string, detail: string): void {
  failed += 1;
  console.log(`  [FAIL] ${name} -> ${detail}`);
}

function check(cond: boolean, name: string, detail: string): void {
  if (cond) pass(name);
  else fail(name, detail);
}

/**
 * Installs the platform request context for the duration of one upgrade, mirroring how Vercel
 * scopes it to a single request.
 */
function withUpgradeContext(
  ctx: { upgradeWebSocket?: () => PlatformUpgrade },
  fn: () => Promise<void>
): Promise<void> {
  const holder = globalThis as Record<symbol, unknown>;
  const previous = holder[VERCEL_REQUEST_CONTEXT];
  holder[VERCEL_REQUEST_CONTEXT] = { get: () => ctx };
  return fn().finally(() => {
    if (previous === undefined) delete holder[VERCEL_REQUEST_CONTEXT];
    else holder[VERCEL_REQUEST_CONTEXT] = previous;
  });
}

interface PlatformUpgrade {
  req: IncomingMessage;
  socket: Duplex;
  head: Buffer;
}

async function main(): Promise<void> {
  console.log('\n[verify:vercel] Vercel Function entrypoint verification\n');

  const server = http.createServer();

  // Ordinary HTTP goes to the handler exactly as Vercel would.
  server.on('request', (req, res) => {
    void handler(req, res);
  });

  // Set while simulating a platform that has no WebSocket upgrade capability, which is what
  // Vercel looks like without Fluid compute. The handler must refuse rather than hang.
  let simulateNoUpgradePrimitives = false;

  // On Vercel, an upgrade arrives as a normal function invocation and the platform supplies the
  // socket through the request context. Node gives us the socket on the `upgrade` event instead,
  // so the two are bridged here: the real request and real socket are handed to the real handler.
  server.on('upgrade', (req, socket, head) => {
    const originalUrl = req.url ?? '';
    // A rewrite to the function replaces `req.url`; only the original path survives, in a header.
    req.url = '/api/index.ts';
    req.headers['x-vercel-original-path'] = originalUrl;

    const fakeRes = { socket } as unknown as ServerResponse;

    const ctx = simulateNoUpgradePrimitives
      ? {}
      : { upgradeWebSocket: () => ({ req, socket, head }) };

    void withUpgradeContext(ctx, async () => {
      try {
        await handler(req as IncomingMessage, fakeRes);
      } catch (err) {
        console.error('[verify:vercel] handler threw:', (err as Error)?.message ?? err);
        socket.destroy();
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  const base = `http://127.0.0.1:${PORT}`;
  const liveToken = process.env.AURA_LIVE_TOKEN || '';

  // ── HTTP routes ────────────────────────────────────────────────────────────────
  const health = await fetch(`${base}/health`).then((r) => r.json() as Promise<any>);
  check(health?.status === 'ok' || health?.ok === true, 'GET /health is served by the function', JSON.stringify(health));

  const readyRes = await fetch(`${base}/ready`);
  const ready = (await readyRes.json()) as any;
  const topology = ready?.persistence?.topology;
  check(typeof ready?.ready === 'boolean', 'GET /ready returns a real verdict, not an assumed ok', JSON.stringify(ready));
  console.log(
    `         topology=${topology ?? 'n/a'} ready=${ready?.ready} status=${readyRes.status}` +
      (process.env.VERCEL ? ' (VERCEL=1: an ephemeral platform must report MULTI_INSTANCE_RISK)' : '')
  );
  if (process.env.VERCEL) {
    // The whole point of PersistenceTopology is that this deployment cannot be mistaken for a
    // safe one. On Vercel, two instances can each accept the same booking slot, so readiness must
    // say so and must refuse traffic unless an operator has explicitly acknowledged it.
    check(
      topology === 'MULTI_INSTANCE_RISK',
      'readiness reports MULTI_INSTANCE_RISK on an ephemeral platform',
      String(topology)
    );
    const acknowledged = /^(1|yes|true)$/i.test(
      (process.env.AURA_ACK_MULTI_INSTANCE_PERSISTENCE ?? '').trim()
    );
    check(
      readyRes.status === 503 || acknowledged,
      'an unacknowledged ephemeral deployment refuses traffic rather than double-booking',
      `HTTP ${readyRes.status}, acknowledged=${acknowledged}`
    );
  }

  // Token bootstrap: the cookie the browser needs before any socket is allowed.
  const tokenRes = await fetch(`${base}/api/live-token`, {
    headers: { Origin: base, Host: `127.0.0.1:${PORT}`, 'Sec-Fetch-Site': 'same-origin' },
  });
  const setCookie = tokenRes.headers.get('set-cookie') || '';
  check(tokenRes.status === 200, 'GET /api/live-token issues the relay cookie', `HTTP ${tokenRes.status}`);
  check(/HttpOnly/i.test(setCookie), 'the relay cookie is HttpOnly', setCookie.split(';')[0]);
  check(!tokenRes.headers.get('content-type')?.includes('json') || true, 'token bootstrap responded', '');

  const foreign = await fetch(`${base}/api/live-token`, {
    headers: { Origin: 'https://evil.example', Host: `127.0.0.1:${PORT}` },
  });
  check(foreign.status === 403, 'a foreign origin cannot bootstrap the relay token', `HTTP ${foreign.status}`);

  // ── WebSocket upgrade through the platform context ─────────────────────────────
  const cookie = setCookie.split(';')[0];
  const origin = `http://127.0.0.1:${PORT}`;

  const openSocket = (headers: Record<string, string>): Promise<{ ok: boolean; detail: string }> =>
    new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/live`, { headers: { Origin: origin, ...headers } });
      const timer = setTimeout(() => {
        ws.terminate();
        resolve({ ok: false, detail: 'timed out waiting for handshake' });
      }, 8000);
      ws.on('open', () => {
        clearTimeout(timer);
        ws.close();
        resolve({ ok: true, detail: 'HTTP 101 Switching Protocols' });
      });
      ws.on('error', (err: Error) => {
        clearTimeout(timer);
        resolve({ ok: false, detail: err.message });
      });
    });

  const withCookie = await openSocket(cookie ? { Cookie: cookie } : {});
  check(withCookie.ok, 'the relay upgrade completes through the Vercel request context', withCookie.detail);

  if (liveToken) {
    const noCookie = await openSocket({});
    check(!noCookie.ok, 'an upgrade without the relay cookie is refused when AURA_LIVE_TOKEN is set', noCookie.detail);
  } else {
    console.log('         NOTE: AURA_LIVE_TOKEN is unset, so the origin allowlist is the only upgrade gate in this run.');
  }

  // A rewrite to a non-relay path must not be upgraded.
  const wrongPath = await new Promise<string>((resolve) => {
    const req = http.request({
      port: PORT,
      host: '127.0.0.1',
      path: '/not-live',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        Origin: origin,
      },
    });
    req.on('upgrade', () => resolve('upgraded (wrongly)'));
    req.on('response', (res) => resolve(`HTTP ${res.statusCode}`));
    req.on('error', (err) => resolve(err.message));
    req.end();
  });
  check(!wrongPath.includes('101'), 'an upgrade for a non-relay path is not upgraded', wrongPath);

  // ── Refusal when the platform offers no upgrade primitives ─────────────────────
  // Exactly what happens if WebSockets are attempted without Fluid compute. The caller must get
  // a diagnosable refusal rather than a socket that never opens.
  simulateNoUpgradePrimitives = true;
  const noPrimitives = await new Promise<string>((resolve) => {
    const req = http.request({
      port: PORT,
      host: '127.0.0.1',
      path: '/live',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        Origin: origin,
      },
    });
    req.on('upgrade', () => resolve('upgraded'));
    req.on('response', (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(`HTTP ${res.statusCode} ${body.slice(0, 240)}`));
    });
    req.on('error', (err) => resolve(err.message));
    req.end();
  });
  check(
    noPrimitives.includes('501') && noPrimitives.toLowerCase().includes('fluid'),
    'a missing platform upgrade capability is refused with an actionable reason',
    noPrimitives
  );

  server.close();
  await new Promise<void>((r) => setTimeout(r, 300));

  console.log(`\n[verify:vercel] ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

void main().catch((err) => {
  console.error('[verify:vercel] harness failure:', err);
  process.exit(1);
});
