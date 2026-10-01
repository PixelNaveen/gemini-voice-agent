import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { WebSocket } from 'ws';

/**
 * Full-stack live-call smoke test.
 *
 * Boots the real relay with the real credential, opens a real WebSocket, performs the real
 * client handshake, and waits for the model to actually speak. This is the only check that
 * exercises the whole chain at once:
 *
 *   client protocol -> origin/token gate -> frame validation -> PromptAuthority ->
 *   project pool -> Gemini Live WebSocket -> setupComplete -> greeting trigger ->
 *   audio + transcript back to the browser
 *
 * Every layer below this has its own unit test, and unit tests cannot tell you the layers
 * are wired to each other. Run with: npm run verify:e2e
 */

const PORT = Number(process.env.E2E_PORT || 4200);
const LIVE_MODEL = process.env.AURA_LIVE_MODEL || 'gemini-3.8-live';
const HANDSHAKE_TIMEOUT_MS = 45_000;
const GREETING_TIMEOUT_MS = 40_000;
const TOOL_PROBE_TIMEOUT_MS = 45_000;

function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    const full = path.resolve(process.cwd(), file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

function serverCommand(): { command: string; args: string[] } {
  const localTsx = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (existsSync(localTsx)) return { command: process.execPath, args: [localTsx, 'server.ts'] };
  return { command: 'npx', args: ['tsx', 'server.ts'] };
}

async function waitForBoot(proc: ChildProcessWithoutNullStreams): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 60_000);
    const onData = (buf: Buffer) => {
      if (buf.toString().includes('Server listening')) {
        clearTimeout(timer);
        proc.stdout.off('data', onData);
        proc.stderr.off('data', onData);
        resolve(true);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
  });
}

interface Frame {
  type?: string;
  state?: string;
  speaker?: string;
  text?: string;
  data?: string;
  mimeType?: string;
  code?: string;
  message?: string;
  projectId?: string;
  personaId?: string;
}

interface ToolProbeResult {
  connected: boolean;
  transcript: string;
  dispatchedTools: string[];
}

/**
 * Asks the live model a question it can only answer truthfully by calling a tool, then reports
 * which tools the server actually dispatched.
 *
 * The metric is the signal, not the transcript. The model can always *say* something plausible
 * - "we have a 2pm opening" - whether or not it dispatched anything, so a transcript match
 * proves only that the model spoke. `tool_call` is incremented in the dispatch loop before any
 * other handling, so a non-zero count is the provider having genuinely asked for a tool, which
 * is the thing a malformed `tools` payload prevents.
 */
async function runToolProbe(
  port: number,
  cookie: string,
  connectionId: string,
  sessionId: string
): Promise<ToolProbeResult> {
  const authHeaders: Record<string, string> = { Origin: `http://127.0.0.1:${port}` };
  if (cookie) authHeaders.Cookie = cookie;

  const readToolCounts = async (): Promise<Record<string, number>> => {
    const res = await fetch(`http://127.0.0.1:${port}/api/metrics`, { headers: authHeaders })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (!res) return {};
    // `LiveMetrics.snapshot()` exposes `toolCalls` / `toolFailed` as flat counters. Earlier
    // revisions of this probe guessed at a `tool_call` key and silently read zero, which would
    // have reported "the declarations are not reaching the provider" against a perfectly
    // working server - a failing check that could only ever mislead.
    const out: Record<string, number> = {};
    for (const key of ['toolCalls', 'toolFailed', 'toolFailures']) {
      const value = (res as any)[key];
      if (typeof value === 'number') out[key] = value;
    }
    return out;
  };

  const before = await readToolCounts();

  const result = await new Promise<ToolProbeResult>((resolve) => {
    const state: ToolProbeResult = { connected: false, transcript: '', dispatchedTools: [] };
    const ws = new WebSocket(`ws://127.0.0.1:${port}/live`, {
      headers: cookie
        ? { Origin: `http://127.0.0.1:${port}`, Cookie: cookie }
        : { Origin: `http://127.0.0.1:${port}` },
    });

    const stop = setTimeout(() => {
      try { ws.close(); } catch {}
      resolve(state);
    }, TOOL_PROBE_TIMEOUT_MS);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'init_session',
          connectionId,
          sessionId,
          personaId: 'aura-salon',
          voice: 'Kore',
        })
      );
    });

    ws.on('message', (raw: Buffer) => {
      let frame: Frame;
      try {
        frame = JSON.parse(raw.toString()) as Frame;
      } catch {
        return;
      }
      if (frame.type === 'status' && frame.state === 'connected') {
        if (state.connected) return;
        state.connected = true;
        // Give the greeting a moment, then ask as the caller would: plain text in, no
        // privileged frame, nothing that could reach a tool by a route other than the model's
        // own decision.
        //
        // The question names the service. Asking "what times are available?" leaves the model
        // two equally reasonable moves - dispatch, or ask which service - and it picks the
        // clarifying question often enough to make the check flaky. That is correct behaviour
        // for the model, not a bug, but it makes the assertion non-deterministic. Naming the
        // service removes the ambiguity it was resolving.
        setTimeout(() => {
          try {
            ws.send(
              JSON.stringify({
                type: 'client_content',
                text: 'Can I book a haircut tomorrow? What times do you have available?',
              })
            );
          } catch {}
        }, 1500);
        return;
      }
      if (frame.type === 'error') {
        clearTimeout(stop);
        try { ws.close(); } catch {}
        resolve(state);
        return;
      }
      if (frame.type === 'transcript' && frame.speaker === 'agent' && frame.text) {
        state.transcript += frame.text;
      }
    });

    ws.on('close', () => {
      clearTimeout(stop);
      resolve(state);
    });
    ws.on('error', () => {
      clearTimeout(stop);
      resolve(state);
    });
  });

  // Read the counters again after the call and keep whatever grew.
  const after = await readToolCounts();
  for (const [k, v] of Object.entries(after)) {
    if (v > (before[k] ?? 0)) result.dispatchedTools.push(`${k}+${v - (before[k] ?? 0)}`);
  }
  return result;
}

async function main(): Promise<void> {
  loadEnv();
  if (!process.env.GEMINI_API_KEY) {
    console.error('[verify:e2e] GEMINI_API_KEY is not set. Cannot run a live call.');
    process.exitCode = 1;
    return;
  }

  const { command, args } = serverCommand();
  const proc = spawn(command, args, {
    env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) },
    stdio: 'pipe',
  });
  let serverLog = '';
  proc.stdout.on('data', (b: Buffer) => (serverLog += b.toString()));
  proc.stderr.on('data', (b: Buffer) => (serverLog += b.toString()));

  let failures = 0;
  const pass = (m: string) => console.log(`  [PASS] ${m}`);
  const fail = (m: string) => {
    failures++;
    console.log(`  [FAIL] ${m}`);
  };

  try {
    if (!(await waitForBoot(proc))) {
      console.error('[verify:e2e] Server did not boot.');
      console.error(serverLog.slice(-2000));
      process.exitCode = 1;
      return;
    }
    console.log('\n[verify:e2e] Full live-call smoke test\n');

    const connectionId = `conn_e2e_${Date.now()}`;
    const sessionId = `sess_e2e_${Date.now()}`;
    let audioBytes = 0;
    let transcript = '';
    let sawConnected = false;
    let sawSetup = false;
    let closing = false;

    // SECTION 13: follow the same path a browser takes. When the server has a relay token
    // configured, the client must first call the bootstrap endpoint to obtain the HttpOnly
    // cookie, which the browser then attaches to the upgrade automatically. Reproducing
    // that here means this test fails if the browser path is ever broken, which a test that
    // simply passed the token as a header would not catch.
    let cookie = '';
    const bootstrap = await fetch(`http://127.0.0.1:${PORT}/api/live-token`, {
      headers: { Origin: `http://127.0.0.1:${PORT}` },
    });
    const configured = ((await bootstrap.json()) as { configured?: boolean }).configured === true;
    if (configured) {
      cookie = (bootstrap.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
      if (cookie) pass('relay token obtained via the HttpOnly cookie bootstrap');
      else fail('relay token is configured but the bootstrap set no cookie');
    } else {
      console.log('  (no relay token configured; running same-origin only)');
    }

    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/live`, {
        headers: cookie ? { Origin: `http://127.0.0.1:${PORT}`, Cookie: cookie } : { Origin: `http://127.0.0.1:${PORT}` },
      });

      const hardStop = setTimeout(() => {
        fail(`no greeting within ${GREETING_TIMEOUT_MS}ms`);
        try { ws.close(); } catch {}
        resolve();
      }, GREETING_TIMEOUT_MS);

      ws.on('open', () => {
        // The real client handshake: no systemInstruction, no greetingPrompt, no client
        // credentials. Everything authoritative is composed server-side.
        ws.send(
          JSON.stringify({
            type: 'init_session',
            connectionId,
            sessionId,
            personaId: 'aura-salon',
            voice: 'Kore',
          })
        );
      });

      ws.on('message', (raw: Buffer) => {
        let frame: Frame;
        try {
          frame = JSON.parse(raw.toString()) as Frame;
        } catch {
          return;
        }

        if (frame.type === 'status' && frame.state === 'connected') {
          if (sawConnected) return;
          sawConnected = true;
          sawSetup = true;
          if (frame.projectId) pass(`relay connected via project "${frame.projectId}"`);
          else pass('relay connected');
          if (frame.personaId === 'aura-salon') pass('server selected the requested persona');
          else fail(`expected persona aura-salon, got ${frame.personaId}`);
          return;
        }

        if (frame.type === 'error') {
          fail(`server error: ${frame.code} ${frame.message ?? ''}`);
          clearTimeout(hardStop);
          try { ws.close(); } catch {}
          resolve();
          return;
        }

        if (frame.type === 'audio' && frame.data) {
          audioBytes += Buffer.from(frame.data, 'base64').length;
          if (audioBytes > 0 && !closing) {
            pass(`received ${audioBytes} bytes of model audio (${frame.mimeType ?? 'audio/pcm'})`);
            // The transcript trails the audio: outputAudioTranscription is only final once
            // the model finishes its turn. Closing on the first audio chunk would race it
            // and report a working transcription path as broken.
            closing = true;
            clearTimeout(hardStop);
            setTimeout(() => {
              try { ws.close(); } catch {}
              resolve();
            }, 6000);
          }
          return;
        }

        if (frame.type === 'transcript' && frame.speaker === 'agent' && frame.text) {
          transcript += frame.text;
        }
      });

      ws.on('error', (err: Error) => {
        fail(`socket error: ${err.message}`);
        clearTimeout(hardStop);
        resolve();
      });
    });

    if (!sawSetup) fail('never reached a connected status from the relay');
    if (audioBytes === 0) fail('no audio returned; the model never spoke');
    if (transcript) pass(`agent transcript: ${JSON.stringify(transcript.slice(0, 160))}`);
    else fail('audio arrived but no transcript; outputAudioTranscription is not working');

    // ── Phase 2: does the model actually know the tools exist? ──
    //
    // Phase 1 only proves the model can speak. It says nothing about tools, and a session
    // whose `tools` payload is malformed still greets the caller perfectly - the model simply
    // never learns it can reach the calendar, and answers "what times do you have?" from
    // imagination. That is exactly the failure a bare (unwrapped) declaration array causes, so
    // it has to be asserted against the live provider rather than against a type.
    //
    // The dispatched-tool log line is the direct signal, because it is only written when a real
    // tool is actually executed. The metric corroborates.
    //
    // The model is not deterministic: given a question it could answer two ways, it sometimes
    // dispatches and sometimes asks a clarifying question instead. That is correct behaviour,
    // not a fault, but it means a single attempt can fail on a working server. So this asks up
    // to three times and passes if any attempt dispatches. It is deliberately not allowed to
    // pass on a *shorter* signal - the loop only ever adds attempts.
    const executed = new Set<string>();
    let toolMetricDelta: string[] = [];
    let probeTranscript = '';
    const ATTEMPTS = 3;
    for (let attempt = 1; attempt <= ATTEMPTS && executed.size === 0; attempt++) {
      const logMark = serverLog.length;
      const probe = await runToolProbe(PORT, cookie, connectionId, sessionId);
      for (const m of serverLog.slice(logMark).matchAll(/\[ToolGateway\] Executing authorized "([^"]+)"/g)) {
        executed.add(m[1]);
      }
      if (probe.dispatchedTools.length > 0) toolMetricDelta = probe.dispatchedTools;
      if (probe.transcript) probeTranscript = probe.transcript;
    }

    if (executed.size > 0) {
      pass(`the model dispatched a real tool from caller text -> ${[...executed].join(', ')}`);
      if (toolMetricDelta.length > 0) pass(`tool metric agrees (${toolMetricDelta.join(', ')})`);
    } else {
      fail(
        `the model answered a direct availability question without executing any tool across ` +
          `${ATTEMPTS} attempts; the tool declarations are not reaching the provider`
      );
    }

    // A tool that dispatches but produces no audible answer is not a success. The provider
    // occasionally returns a literal "<no speech>" marker for a turn it declines to speak, and
    // the previous check accepted any non-empty string - so a call where the tool ran, the
    // metric incremented, and the caller heard *nothing* was reported green. For a voice
    // receptionist that is the single worst failure mode: it looks healthy right up until a
    // customer is on the line.
    const SILENT_MARKERS = ['<no speech>', '{pause}', 'no speech', '(silence)'];
    const audible = probeTranscript.trim().length > 0 &&
      !SILENT_MARKERS.some((m) => probeTranscript.toLowerCase().includes(m));

    if (audible) {
      pass(`tool-probe answer: ${JSON.stringify(probeTranscript.slice(0, 160))}`);
    } else if (executed.size === 0) {
      fail('the tool probe produced no transcript at all');
    } else {
      fail(
        `the tool executed but the caller would hear nothing: the model returned ` +
          `${JSON.stringify(probeTranscript.slice(0, 80))} instead of a spoken answer. ` +
          `The turn must be retried or repaired, not reported as a pass.`
      );
    }

    // A clean shutdown proves the slot is released rather than leaked.
    await new Promise((r) => setTimeout(r, 1500));
    const status = await fetch(`http://127.0.0.1:${PORT}/api/cluster/status`)
      .then((r) => r.json() as Promise<{ cluster?: { id: string; activeConnections: number }[] }>)
      .catch(() => null);
    if (status?.cluster) {
      const leaked = status.cluster.filter((p) => (p.activeConnections ?? 0) > 0);
      if (leaked.length === 0) pass('all project slots released after the call ended');
      else fail(`slot leak: ${leaked.map((p) => p.id).join(', ')} still active`);
    } else {
      fail('could not read /api/cluster/status to verify slot release');
    }
  } finally {
    proc.kill();
  }

  if (failures > 0) {
    console.error(`\n[verify:e2e] ${failures} check(s) FAILED. Server log tail:\n`);
    console.error(serverLog.split('\n').slice(-25).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\n[verify:e2e] Full live call succeeded end to end.\n');
  }
}

void main();
