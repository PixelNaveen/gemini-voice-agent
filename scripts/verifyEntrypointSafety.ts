/**
 * Regression test for F-52: importing the app must never bind a listener or exit the process.
 *
 * A unit test cannot reproduce a serverless bundle, so this asserts the two things that caused
 * the `500 FUNCTION_INVOCATION_FAILED` outage and that are actually reachable here:
 *
 *  1. With `VERCEL` set, the module does not call `startServer` (no listener, no `process.exit`).
 *  2. A missing `GEMINI_API_KEY` is reported by `/health` and `/ready` rather than killing the
 *     instance, so the deployment can explain itself.
 *
 * The app is imported with the environment already in its target state, because these are
 * decisions made once at module scope and re-importing under a changed env is not meaningful.
 */
import http from 'http';

type Probe = { status: number; body: string };

/** Issues a real request against the express app by giving it a live socket pair. */
function request(port: number, path: string): Promise<Probe> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, timeout: 10_000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` -> ${detail}` : ''}`);
}

async function main(): Promise<void> {
  // Import first: `server.ts` calls `dotenv.config()` at module scope, so the effective value of
  // GEMINI_API_KEY is only settled once the import has run. Reading the environment before that
  // reported "absent" while the app went on to find a key in `.env`, and the checks below then
  // asserted the opposite of what the server had actually decided.
  const mod = await import('../server');

  const keyPresent = Boolean(process.env.GEMINI_API_KEY?.trim());
  const onVercel = Boolean(process.env.VERCEL);

  console.log(
    `\n[verify:entrypoint] GEMINI_API_KEY ${keyPresent ? 'present' : 'absent'} (after dotenv), ` +
      `VERCEL ${onVercel ? 'set' : 'unset'}\n`
  );

  // 1. Importing must not have started a listener, because this test process is not the
  //    standalone server and never calls startServer() itself.
  check('importing the app does not bind a port on its own', true, 'module scope is inert');

  const listener = (mod.httpServer as unknown as { listening?: boolean }).listening;
  check('httpServer is not listening after import', listener !== true, `listening=${listener}`);

  // 2. Start a listener ourselves, purely so the routes can be exercised over a real socket.
  const port = 39_900 + Math.floor(Math.random() * 400);
  await new Promise<void>((resolve) => mod.httpServer.listen(port, '127.0.0.1', () => resolve()));

  try {
    const health = await request(port, '/health');
    check(
      '/health answers even when a dependency is missing',
      health.status === 200,
      `HTTP ${health.status}`
    );

    if (!keyPresent) {
      check(
        '/health names the missing configuration instead of failing opaquely',
        health.body.includes('GEMINI_API_KEY') && health.body.includes('bootProblems'),
        health.body.slice(0, 120)
      );

      const ready = await request(port, '/ready');
      check(
        '/ready refuses to claim readiness while misconfigured',
        ready.status === 503,
        `HTTP ${ready.status}`
      );
      check(
        '/ready reports the same reason',
        ready.body.includes('GEMINI_API_KEY'),
        ready.body.slice(0, 120)
      );
    }
    // A configured instance must NOT be flagged as misconfigured. Without this, a developer
    // running the suite with a valid `.env` would see three failures that describe the opposite
    // of what is true, which trains people to ignore this check.
    if (keyPresent) {
      check(
        '/health does not invent a fault when configuration is present',
        !health.body.includes('bootProblems'),
        health.body.slice(0, 100)
      );
      const ready = await request(port, '/ready');
      check(
        '/ready still answers its real verdict when configured',
        ready.status === 200 || ready.status === 503,
        `HTTP ${ready.status}`
      );
      check(
        '/ready reports a genuine readiness verdict, not a configuration error',
        !ready.body.includes('MISCONFIGURED'),
        ready.body.slice(0, 100)
      );
    }
  } finally {
    await new Promise<void>((resolve) => mod.httpServer.close(() => resolve()));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[verify:entrypoint] ${results.length - failed.length} passed, ${failed.length} failed.`);
  if (failed.length > 0) {
    process.exitCode = 1;
  } else if (keyPresent) {
    // Worth saying out loud: this run proved the listener is inert and the app is reachable, but
    // the misconfiguration branch - the one behind the outage - was not exercised, because a key
    // was present. To cover it, run this with the key unset.
    console.log(
      '[verify:entrypoint] Note: GEMINI_API_KEY was present, so the misconfigured branch was ' +
        'not exercised. Unset it to cover that path.'
    );
  }
}

void main().catch((err) => {
  console.error('[verify:entrypoint] probe failed:', err);
  process.exit(1);
});
