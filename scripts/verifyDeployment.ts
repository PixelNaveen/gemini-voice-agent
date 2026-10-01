/**
 * Preflight check for a deployed AURA instance.
 *
 * ## Why this exists
 *
 * A successful `vercel build` proves only that the code compiles. It says nothing about whether
 * the deployment can actually take a call, and the difference between those two states is where
 * every Vercel problem so far has shown up: the runtime refuses to report ready, the WebSocket
 * upgrade is rejected, or the relay cookie is never issued. Each of those is invisible in a build
 * log and obvious in one HTTP response.
 *
 * The alternative is reading function logs after a visitor has already told you the call is
 * broken. This runs the same four requests the browser makes, in order, and says which step failed
 * and what the server actually replied.
 *
 * ## Usage
 *
 *   npx tsx scripts/verifyDeployment.ts https://your-deployment.vercel.app
 *   npx tsx scripts/verifyDeployment.ts https://your-deployment.vercel.app --token <live-token>
 *
 * The token is optional and only needed when the deployment sets `AURA_LIVE_TOKEN`. Pass it via
 * the flag or the `AURA_LIVE_TOKEN` environment variable; it is never written to disk or echoed.
 *
 * ## What each step proves
 *
 * - `/health`           the function is running and `server.ts` imported cleanly
 * - `/ready`            whether the instance believes it can safely serve a call, and why not
 * - `/api/live-token`   the relay cookie is issued (this is the step most often silently failing)
 * - `GET /live`         the upgrade is refused as a normal HTTP response rather than accepted
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith('--'));
const tokenIndex = argv.indexOf('--token');
const explicitToken = tokenIndex >= 0 ? argv[tokenIndex + 1] : undefined;
const token = explicitToken ?? process.env.AURA_LIVE_TOKEN;

const VERBOSE = argv.includes('--verbose');

interface StepResult {
  step: string;
  ok: boolean;
  detail: string;
  /** True when the failure is expected on a correctly configured Vercel project. */
  informational?: boolean;
}

let failures = 0;
let warnings = 0;

function record(r: StepResult): void {
  if (r.ok) {
    console.log(`  [PASS] ${r.step}${r.detail ? ` -> ${r.detail}` : ''}`);
  } else if (r.informational) {
    warnings += 1;
    console.log(`  [WARN] ${r.step} -> ${r.detail}`);
  } else {
    failures += 1;
    console.log(`  [FAIL] ${r.step} -> ${r.detail}`);
  }
}

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** Performs a request without following redirects, so a 3xx is visible rather than hidden. */
function request(
  url: string,
  opts: { method?: string; headers?: Record<string, string> } = {}
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(
      parsed,
      {
        method: opts.method ?? 'GET',
        headers: { 'User-Agent': 'aura-preflight/1.0', ...(opts.headers ?? {}) },
        timeout: 20_000,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: body.slice(0, 600) })
        );
      }
    );
    req.on('timeout', () => req.destroy(new Error('request timed out after 20s')));
    req.on('error', reject);
    req.end();
  });
}

/** Trims a body to something readable without dumping a stack trace into the console. */
function summarise(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed);
  } catch {
    return body.replace(/\s+/g, ' ').trim().slice(0, 200);
  }
}

async function checkHealth(base: string): Promise<void> {
  try {
    const res = await request(`${base}/health`);
    record({
      step: '/health responds 200 (the function is running)',
      ok: res.status === 200,
      detail: res.status === 200 ? summarise(res.body) : `HTTP ${res.status} ${summarise(res.body)}`,
    });
  } catch (err) {
    record({ step: '/health responds 200 (the function is running)', ok: false, detail: String(err) });
  }
}

async function checkReady(base: string): Promise<void> {
  try {
    const res = await request(`${base}/ready`);
    let topology = 'unknown';
    try {
      topology = (JSON.parse(res.body) as any)?.persistence?.topology ?? 'unknown';
    } catch {
      /* reported below via the status code */
    }

    if (res.status === 200) {
      record({ step: '/ready reports the instance can serve a call', ok: true, detail: topology });
      return;
    }

    if (res.status === 503 && topology === 'MULTI_INSTANCE_RISK') {
      // Expected and correct on Vercel without a shared transactional store. It is not a
      // deployment fault; it is the design refusing to accept duplicate bookings. Said here
      // explicitly so nobody spends an hour chasing a 503 that is working as designed.
      warnings += 1;
      console.log(
        '  [WARN] /ready is 503 MULTI_INSTANCE_RISK -> correct on Vercel without a shared store.\n' +
          '         This is NOT why a call fails: /live does not consult /ready. For a demo you can\n' +
          '         set AURA_ACK_MULTI_INSTANCE_PERSISTENCE=true; for real traffic use the container.'
      );
      return;
    }

    record({
      step: '/ready reports the instance can serve a call',
      ok: false,
      detail: `HTTP ${res.status} ${summarise(res.body)}`,
    });
  } catch (err) {
    record({ step: '/ready reports the instance can serve a call', ok: false, detail: String(err) });
  }
}

async function checkToken(base: string): Promise<void> {
  try {
    // `Origin` is required: the relay rejects token requests without it, exactly as it would
    // for a page that somehow omitted the header. Omitting it here would produce a 403 that
    // looks like a deployment fault but is only an artifact of the check.
    const res = await request(`${base}/api/live-token`, {
      headers: { Accept: 'application/json', Origin: base },
    });
    const setCookie = res.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const relayCookie = cookies.find((c) => c.includes('aura_live'));

    if (res.status !== 200) {
      record({
        step: '/api/live-token issues the relay cookie',
        ok: false,
        detail: `HTTP ${res.status} ${summarise(res.body)}`,
      });
      return;
    }
    if (!relayCookie) {
      record({
        step: '/api/live-token issues the relay cookie',
        ok: false,
        detail: `HTTP 200 but no Set-Cookie header (saw ${cookies.length} cookie(s)). ` +
          'The upgrade will be rejected 401 once AURA_LIVE_TOKEN is set.',
      });
      return;
    }

    // Report the security posture without printing the secret.
    const flags = [
      /HttpOnly/i.test(relayCookie) ? 'HttpOnly' : 'NOT-HttpOnly',
      /SameSite=Strict/i.test(relayCookie) ? 'SameSite=Strict' : 'NOT-SameSite=Strict',
      /Secure/i.test(relayCookie) ? 'Secure' : 'NOT-Secure',
    ];
    record({ step: '/api/live-token issues the relay cookie', ok: true, detail: flags.join(', ') });
  } catch (err) {
    record({ step: '/api/live-token issues the relay cookie', ok: false, detail: String(err) });
  }
}

async function checkUpgrade(base: string): Promise<void> {
  const wsUrl = `${base.replace(/^http/, 'ws')}/live`;
  try {
    // A raw upgrade request: no `Upgrade: websocket` completion is expected, because this
    // process is not a real WebSocket client. What matters is whether the server ACCEPTS the
    // upgrade (101) or REFUSES it with a readable HTTP status, which is the diagnosable case.
    const res = await new Promise<RawResponse>((resolve, reject) => {
      const parsed = new URL(wsUrl);
      // The upgrade is expressed in the HEADERS, not the URL scheme. `http.request` refuses a
      // `ws:` URL outright, so the scheme is normalised to http/https for the transport while
      // the Upgrade headers still express the WebSocket intent.
      if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
      else if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
      // The relay validates that this decodes to exactly 16 bytes, as RFC 6455 requires, so the
      // canonical example nonce is used rather than an arbitrary string.
      const key = 'dGhlIHNhbXBsZSBub25jZQ==';
      const req = (parsed.protocol === 'https:' ? https : http).request(
        parsed,
        {
          headers: {
            Connection: 'Upgrade',
            Upgrade: 'websocket',
            'Sec-WebSocket-Version': '13',
            'Sec-WebSocket-Key': key,
            Origin: base,
            ...(token ? { Cookie: `aura_live=${encodeURIComponent(token)}` } : {}),
          },
          timeout: 20_000,
        },
        (r) => {
          let body = '';
          r.setEncoding('utf8');
          r.on('data', (c) => (body += c));
          r.on('end', () => resolve({ status: r.statusCode ?? 0, headers: r.headers, body: body.slice(0, 400) }));
        }
      );
      req.on('upgrade', () => resolve({ status: 101, headers: {}, body: '' }));
      req.on('timeout', () => req.destroy(new Error('timed out')));
      req.on('error', reject);
      req.end();
    });

    if (res.status === 101) {
      record({ step: '/live accepts the WebSocket upgrade', ok: true, detail: 'HTTP 101' });
      return;
    }

    const body = summarise(res.body);
    if (res.status === 501) {
      record({
        step: '/live accepts the WebSocket upgrade',
        ok: false,
        detail: `HTTP 501 ${body} -> enable Fluid compute for this project (Settings > Functions). ` +
          'Vercel will not proxy a WebSocket without it, and no code change can work around it.',
      });
    } else if (res.status === 401 || res.status === 403) {
      record({
        step: '/live accepts the WebSocket upgrade',
        ok: false,
        detail: `HTTP ${res.status} ${body} -> the relay refused the origin or token. ` +
          'If AURA_LIVE_TOKEN is set, this check needs --token. If AURA_ALLOWED_ORIGINS is set, ' +
          `it must include ${base}.`,
      });
    } else {
      record({ step: '/live accepts the WebSocket upgrade', ok: false, detail: `HTTP ${res.status} ${body}` });
    }
  } catch (err) {
    record({ step: '/live accepts the WebSocket upgrade', ok: false, detail: String(err) });
  }
}

async function main(): Promise<void> {
  if (!target) {
    console.error(
      'usage: npx tsx scripts/verifyDeployment.ts <deployment-url> [--token <live-token>] [--verbose]'
    );
    process.exit(2);
  }

  const base = target.replace(/\/+$/, '');
  console.log(`\n[verify:deployment] Preflight for ${base}\n`);

  await checkHealth(base);
  await checkReady(base);
  await checkToken(base);
  await checkUpgrade(base);

  if (VERBOSE) {
    console.log('\n  Re-run any single step with curl:');
    console.log(`    curl -i ${base}/health`);
    console.log(`    curl -i ${base}/ready`);
    console.log(`    curl -i ${base}/api/live-token`);
    console.log(
      `    curl -i -H "Connection: Upgrade" -H "Upgrade: websocket" \\\n` +
        `         -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \\\n` +
        `         -H "Origin: ${base}" ${base}/live`
    );
  }

  console.log(
    `\n[verify:deployment] ${failures} failed, ${warnings} warning(s).\n` +
      'If every step passed and a visitor still cannot connect, the problem is in the browser:\n' +
      '  - ask for the browser console output; a CSP violation or a mixed-content block shows there\n' +
      '  - microphone permission is a separate failure from the WebSocket and is not covered here\n'
  );

  process.exit(failures > 0 ? 1 : 0);
}

void main().catch((err) => {
  console.error('[verify:deployment] preflight failure:', err);
  process.exit(1);
});
