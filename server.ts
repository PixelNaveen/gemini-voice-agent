import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer, type IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Modality, type LiveConnectConfig } from '@google/genai';
import { GeminiProjectPool, type ProjectSlot } from './src/server/projects/GeminiProjectPool';
import { PromptAuthority } from './src/server/prompt/PromptAuthority';
import { PersonaBusinessTruth } from './src/personas/PersonaBusinessTruth';
import { PersonaRegistry } from './src/personas/PersonaRegistry';
import { ToolGateway } from './src/tools/ToolGateway';
import { ErrorManager } from './src/core/errors';
import {
  buildToolDeclarations,
  validateToolArguments,
  toFunctionResponse,
} from './src/tools/FunctionCalling';
import { LiveMetrics } from './src/server/observability/LiveMetrics';
import {
  parseClientFrame,
  PROTOCOL_LIMITS,
  type InitSessionCommand,
  type ReconnectSessionCommand,
} from './src/server/protocol/liveProtocol';
import {
  securityHeaders,
  isOriginAllowed,
  isHttpRequestSameOrigin,
  checkLiveAuth,
  liveAuthConfigured,
  allowedOrigins,
  RateLimiter,
  rateLimit,
  clientKey,
  LIVE_TOKEN_COOKIE,
  operatorOnly,
} from './src/server/security/guards';
import { getSessionRegistry } from './src/server/sessions/SessionRegistry';
import { describeTopology, reportPersistenceTopology } from './src/persistence/PersistenceTopology';
import { AppointmentStore } from './src/persistence/stores/AppointmentStore';
import { DependencyHealth } from './src/observability/DependencyHealth';
import { AlertManager } from './src/observability/AlertManager';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * SECTION 15: Fail fast on missing configuration.
 *
 * The client was previously constructed unconditionally with `apiKey: ''`. Every request
 * then failed deep inside the SDK with an opaque 400, and the "fallback" paths happily
 * returned fake success to the caller. A missing key is now a hard, explicit boot error.
 *
 * F-51: "hard boot error" used to mean `process.exit(1)` at module scope. That is correct for
 * `npm start`, where the process owns the terminal and the operator is watching it. It is
 * actively harmful for a Vercel function: the module is imported once per invocation, so a
 * missing environment variable killed the instance and Vercel reported every single route as
 * `500 FUNCTION_INVOCATION_FAILED` - including `/health` and `/ready`, the two endpoints whose
 * entire job is to explain what is wrong. The deployment looked healthy in the dashboard and
 * was completely dead, and the only clue was a function log line nobody sees.
 *
 * Boot problems are therefore *recorded* here and surfaced through the diagnostic routes, and
 * the process is only killed when it is the standalone entrypoint (`startServer`), where
 * exiting is the correct and visible behaviour.
 */
const bootProblems: string[] = [];

const primaryApiKey = process.env.GEMINI_API_KEY?.trim();
if (!primaryApiKey) {
  const problem =
    'GEMINI_API_KEY is not set. The relay cannot serve a call until it is configured ' +
    '(set it in .env.local for local work, or in the Vercel project Environment Variables).';
  bootProblems.push(problem);
  console.error(`[boot] ${problem}`);
}

// Standard Server-Side Gemini Client.
//
// Only constructed when a key exists. Constructing it unconditionally was the original bug, and
// constructing it lazily is what lets the diagnostic routes still answer when the key is absent.
const ai: GoogleGenAI | null = primaryApiKey
  ? new GoogleGenAI({
      apiKey: primaryApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

/** Returns the shared client, or throws a diagnosable error naming the missing configuration. */
function requireAi(): GoogleGenAI {
  if (!ai) {
    throw new Error(
      'Gemini is not configured: GEMINI_API_KEY is missing. ' +
        'Check /health for the boot problems that prevented this instance from starting.'
    );
  }
  return ai;
}

const LIVE_MODEL = process.env.AURA_LIVE_MODEL || 'gemini-3.8-live';

/**
 * F-16: how long to wait for the provider's `setupComplete` before sending the greeting
 * trigger anyway. Generous enough for a cold start on a slow project, short enough that a
 * provider which never reports readiness does not strand the caller in silence.
 */
const SETUP_READY_TIMEOUT_MS = Number(process.env.AURA_SETUP_READY_TIMEOUT_MS || 8000);
const TTS_MODEL = process.env.AURA_TTS_MODEL || 'gemini-3.8-flash-lite-tts';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(securityHeaders);
// SECTION 15: 10 MB of JSON on every route is a trivial memory-exhaustion vector. The
// largest legitimate payloads are a conversation snapshot or a sentence to speak.
app.use(express.json({ limit: '64kb' }));

const httpServer = createServer(app);
const metrics = new LiveMetrics();

// SECTION 13: Rate limits. The TTS endpoints spend the Gemini key on every call, so they
// must not be reachable as an open proxy.
const ttsLimiter = new RateLimiter({ name: 'tts', capacity: 30, windowMs: 60_000 });
const greetingLimiter = new RateLimiter({ name: 'greeting', capacity: 10, windowMs: 60_000 });
const clusterStatusLimiter = new RateLimiter({ name: 'cluster-status', capacity: 30, windowMs: 60_000 });
// SECTION 13: the token bootstrap hands out the relay secret, so it is the most sensitive
// endpoint on the server. Kept tight deliberately; a legitimate browser needs one call per
// page load, not one per reconnect.
const liveTokenLimiter = new RateLimiter({ name: 'live-token', capacity: 20, windowMs: 60_000 });

// ───────────────────────────── Startup self-check ─────────────────────────────

/**
 * SECTION 09: Persona/tool policy validation. Runs at boot so an inconsistent price
 * table or a tool the server cannot honestly implement fails the deploy instead of
 * quietly degrading during a live call.
 */
const registryProblems = PersonaBusinessTruth.auditRegistry((tool) => ToolGateway.isImplemented(tool));
if (registryProblems.length > 0) {
  console.error('[boot] Persona registry validation FAILED:');
  for (const problem of registryProblems) {
    console.error(`       - ${problem}`);
    bootProblems.push(`Persona registry: ${problem}`);
  }
} else {
  console.log(
    `[boot] Persona registry validated: ${PersonaRegistry.list().length} personas, ` +
      `ids = ${PersonaRegistry.list().map((p) => p.id).join(', ')}`
  );
}

// ───────────────────────────── Read-only diagnostics ─────────────────────────────

/**
 * Readiness and liveness are deliberately different answers, and readiness is a public gate
 * that an orchestrator must be able to call without a credential. So the *verdict* is public;
 * only the detail is gated.
 *
 * When no operator credential is configured - local development, or a container started
 * without one - the detail is withheld anyway rather than shown. The reasoning is that an
 * unconfigured deployment is exactly the one most likely to be running somewhere public, and
 * the detail names internal hosts, dependency state and failure text. Nothing legitimate
 * depends on an anonymous caller seeing it, so the safe default is to omit it. An operator
 * who wants it sets `AURA_LIVE_TOKEN`.
 */
function operatorDetailAvailable(req: Request): boolean {
  if (!liveAuthConfigured()) return false;
  return checkLiveAuth(req).ok;
}

/**
 * SECTION 17: health and readiness.
 *
 * Liveness and readiness are deliberately different answers. "The process is running" is
 * always true here and is what an orchestrator restart policy should act on. "The process can
 * honestly serve a call" is not: if the appointment journal is unreadable, this instance will
 * refuse bookings, and reporting 200 would have an orchestrator keep routing callers to it.
 *
 * `/health` stays 200 when the process is alive so a restarting platform is not told to kill a
 * server that is merely degraded; `/ready` is the gate that refuses traffic.
 */
app.get('/health', (_req: Request, res: Response) => {
  // F-51: boot problems are reported here. `/health` stays 200 while the process is alive so a
  // restarting platform is not told to kill a merely degraded server, but a configuration fault
  // means this instance cannot serve a call at all, so it is stated explicitly and named rather
  // than being left to surface as an unexplained `500 FUNCTION_INVOCATION_FAILED`.
  res.json({
    status: bootProblems.length === 0 ? 'ok' : 'misconfigured',
    uptimeMs: metrics.snapshot().uptimeMs,
    liveModel: LIVE_MODEL,
    ...(bootProblems.length > 0
      ? { ready: false, bootProblems }
      : {}),
  });
});

app.get('/ready', async (_req: Request, res: Response) => {
  // An unconfigured instance must never claim it is ready: doing so is how a caller gets routed
  // into a function that will refuse the call.
  if (bootProblems.length > 0) {
    res.status(503).json({
      ready: false,
      error: 'MISCONFIGURED',
      bootProblems,
      persistence: { topology: describeTopology().includes('Multiple') ? 'MULTI_INSTANCE' : 'SINGLE_INSTANCE' },
    });
    return;
  }

  // Touch the store so its real state is observed rather than assumed.
  const storeReadable = (() => {
    try {
      AppointmentStore.list();
      return true;
    } catch {
      return false;
    }
  })();

  // Session state mirrors to disk so a refresh that lands after a restart resumes the same
  // call. If that mirror is failing, the instance still serves live calls from memory but has
  // lost restart-resilience, which is exactly the state an orchestrator should hear about.
  const sessionDurable = getSessionRegistry().durable;
  if (!sessionDurable) {
    DependencyHealth.updateStatus(
      'SessionRegistry',
      'DEGRADED',
      'session state could not be mirrored to disk; refreshes across a restart will not resume'
    );
  }

  // Probe the provider credential for real. Waiting for `GeminiLive` to be observed by call
  // traffic would mean a freshly started instance never became ready - an orchestrator would
  // pull it and it would never get the traffic that would have proved it. But a readiness
  // check that merely counts configured projects is worse: it reports HEALTHY for a revoked
  // key. So this asks the provider, cheaply and cached, and a 503 is a real answer.
  const pool = GeminiProjectPool.getInstance();
  const configError = pool.getConfigurationError();
  const credentialOk = configError === null ? await pool.verifyCredential() : false;
  const providerUsable = credentialOk === true;
  DependencyHealth.updateStatus(
    'GeminiLive',
    providerUsable ? 'HEALTHY' : 'DOWN',
    providerUsable
      ? 'a provider credential was accepted'
      : configError ??
        (credentialOk === null
          ? 'the provider credential has not been verified yet'
          : 'the provider rejected the configured credential')
  );

  // A many-instance deployment with a local journal can double-book the same slot, so it is
  // reported here rather than discovered by two customers. The platform cannot be fixed from
  // this code, but it can be made impossible to ignore.
  const persistence = reportPersistenceTopology();

  const ready = storeReadable && persistence.safe && DependencyHealth.isSystemReady();
  res.status(ready ? 200 : 503).json({
    ready,
    // A caller that is not being routed traffic does not need to know why, but an operator
    // debugging a 503 does. Stated as a fact rather than buried in a log line.
    persistence: {
      topology: persistence.topology,
      shared: false,
      acknowledged: persistence.acknowledged,
    },
    // Anonymous callers get the verdict only. The per-dependency detail names internal hosts
    // and failure text, which is reconnaissance material, not public telemetry.
    ...(operatorDetailAvailable(_req)
      ? { dependencies: DependencyHealth.getAll(), blocking: DependencyHealth.blocking().map((d) => d.name) }
      : {}),
  });
});

/**
 * SECTION 17: relay metrics for operators and dashboards.
 *
 * Operator-gated: the snapshot includes per-project slot usage and internal error strings,
 * which is reconnaissance material rather than public telemetry.
 */
app.get('/api/metrics', operatorOnly((_req: Request, res: Response) => {
  const snapshot = metrics.snapshot();
  res.json({ ...snapshot, alerts: AlertManager.evaluateRules(snapshot), dependencies: DependencyHealth.getAll() });
}));

/**
 * SECTION 17: live session registry, with no transcript or caller content.
 *
 * Operator-gated: it exposes live session identifiers and personas, which is enough to
 * correlate a specific caller's activity if a session id ever leaks.
 */
app.get('/api/sessions', operatorOnly((_req: Request, res: Response) => {
  res.json({ sessions: metrics.sessionList() });
}));

// SECTION 14: persona catalogue for the settings UI. Publishes capability metadata only.
app.get('/api/personas', (_req: Request, res: Response) => {
  res.json({
    personas: PersonaRegistry.list().map((p) => ({
      id: p.id,
      version: p.version,
      businessName: p.business.name,
      timezone: p.business.timezone,
      greetingPhrase: p.conversationStyle.greetingPhrase ?? null,
      services: (p.services ?? []).map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes })),
      tools: p.tools.allowed,
      bookingEnabled: p.booking?.enabled ?? false,
    })),
  });
});

/**
 * SECTION 12: the exact prompt the server will use, for operator verification.
 *
 * Operator-gated. This returns the full composed system prompt, so leaving it public would
 * publish the prompt-injection fences, the authority rules, and the business-fact injection
 * format. That is a description of how to defeat them.
 */
app.get('/api/prompt-preview', operatorOnly((req: Request, res: Response) => {
  const personaId = String(req.query.personaId ?? PersonaRegistry.list()[0]?.id ?? '');
  try {
    const assembled = PromptAuthority.assemble({
      personaId,
      sessionId: 'preview',
      connectionId: 'preview',
      isRecovery: false,
    });
    res.json({
      personaId,
      systemInstruction: assembled.systemInstruction,
      greetingPrompt: assembled.greetingPrompt,
      authority: assembled.authority,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Unable to assemble prompt' });
  }
}));

// SECTION 13: relay-token bootstrap.
//
// A browser cannot set a custom header on a WebSocket handshake, so the relay token has to
// reach the client another way. Handing it to the page as a readable value would put the
// secret in reach of any injected script, and putting it in the URL would write it into
// every access log along the path.
//
// Instead this endpoint sets an HttpOnly, SameSite=Strict cookie that the browser attaches
// to the upgrade request on its own. The secret is never returned in the response body, so
// page JavaScript cannot read it even if it is compromised.
//
// The endpoint is origin-checked and rate limited, so a cross-site page cannot use it to
// harvest a token: a cross-origin `fetch` is not readable by the attacker even when the
// browser will send it, and `SameSite=Strict` stops the cookie from being attached to a
// cross-site upgrade in the first place.
app.get('/api/live-token', rateLimit(liveTokenLimiter), (req, res) => {
  if (!liveAuthConfigured()) {
    // Nothing to hand out. The relay is same-origin only, which is a supported mode.
    res.json({ configured: false });
    return;
  }

  if (!isHttpRequestSameOrigin(req)) {
    metrics.increment('unauthorized', 'bad_origin');
    res.status(403).json({ error: 'origin not allowed' });
    return;
  }

  // The `__Host-` prefix is a browser-enforced contract: the browser rejects the cookie
  // outright unless it carries `Secure`, has no `Domain` attribute, and uses `Path=/`. That
  // makes it impossible for a subdomain or a sibling path to widen the cookie's reach.
  //
  // The catch is that the browser also rejects a `__Host-` cookie that is not `Secure`, so
  // applying the prefix over plain local http would silently break development: the cookie
  // would be dropped and every call would 401. Use the hardened name when the connection is
  // genuinely secure, and a plain name otherwise, so the security upgrade and the developer
  // experience do not trade against each other.
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.secure;
  const cookieName = secure ? LIVE_TOKEN_COOKIE : 'aura_live';
  const attributes = [
    `${cookieName}=${encodeURIComponent(process.env.AURA_LIVE_TOKEN!)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=3600',
  ];
  if (secure) attributes.push('Secure');

  res.setHeader('Set-Cookie', attributes.join('; '));
  // The body deliberately contains no secret.
  res.json({ configured: true });
});

// API Endpoint for Multi-Project Cluster Health Status (Section 10 & 11)
app.get('/api/cluster/status', rateLimit(clusterStatusLimiter), (_req, res) => {
  try {
    const pool = GeminiProjectPool.getInstance();
    const cluster = pool.getClusterStatus();
    res.json({
      timestamp: Date.now(),
      totalProjects: cluster.length,
      cluster,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to get cluster status' });
  }
});

/** Shared TTS implementation. Returns base64 audio or null, never a fabricated payload. */
async function synthesizeSpeech(
  text: string,
  voice: string,
  style: string,
  personaId: string
): Promise<{ audio: string | null; mimeType: string }> {
  const response = await requireAi().models.generateContent({
    model: TTS_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text,
            speechMetadata: { style },
          },
        ],
      },
    ],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice || 'Kore' },
        },
      },
    },
  });

  const inline = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const audio = inline?.inlineData?.data ?? null;
  const mimeType = inline?.inlineData?.mimeType ?? 'audio/wav';

  if (!audio) {
    console.warn(
      `[tts] ${TTS_MODEL} returned no audio for persona ${personaId} (finishReason: ${
        response.candidates?.[0]?.finishReason ?? 'unknown'
      })`
    );
  }
  return { audio, mimeType };
}

// API Endpoint for Instant Greeting TTS
//
// Operator-gated. This spends the Gemini TTS quota on server-side credentials, and no
// browser code path calls it: the live agent already streams its own greeting audio from the
// Gemini session. Leaving it public would therefore be a pure liability, an unauthenticated
// endpoint that converts server API keys into speech for anyone on the internet, bounded only
// by a per-IP rate limit that a single motivated caller can spread across addresses.
app.post('/api/greeting', rateLimit(greetingLimiter), operatorOnly(async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const personaId =
      typeof body.personaId === 'string' && PersonaRegistry.list().some((p) => p.id === body.personaId)
        ? body.personaId
        : PersonaRegistry.list()[0]?.id ?? '';
    const voice = typeof body.voice === 'string' ? body.voice : 'Kore';

    // SECTION 12: the greeting wording is derived from the validated persona, not from an
    // arbitrary client string. A caller can only pick a persona.
    const fallbackGreeting =
      PersonaBusinessTruth.getContact(personaId).businessName
        ? `Thanks for calling. How can I help you today?`
        : 'How can I help you today?';
    const greetingText =
      typeof body.greetingText === 'string' && body.greetingText.trim().length > 0
        ? body.greetingText.slice(0, 400)
        : PersonaRegistry.get(personaId).conversationStyle.greetingPhrase ?? fallbackGreeting;

    try {
      const { audio, mimeType } = await synthesizeSpeech(greetingText, voice, 'Warm, clear, natural receptionist', personaId);
      res.json({ text: greetingText, audio, mimeType, personaId });
    } catch (modelErr: any) {
      // Honest failure: no audio, and an explicit flag so the UI can fall back to the
      // browser speech synthesiser instead of playing silence.
      console.warn('[tts] Greeting synthesis warning:', modelErr?.message);
      res.status(503).json({
        text: greetingText,
        audio: null,
        error: 'tts_unavailable',
        detail: modelErr?.message ?? 'TTS unavailable',
      });
    }
  } catch (err: any) {
    console.warn('[tts] Greeting endpoint fallback:', err?.message);
    res.status(503).json({ text: 'Hello, how can I help you today?', audio: null, error: 'tts_unavailable' });
  }
}));

// API Endpoint for General Text-to-Speech
//
// Operator-gated, and for a sharper reason than the greeting route: this accepts arbitrary
// caller-supplied text and synthesizes it. That is an open, billable synthesis service on
// the operator's Gemini key, usable for arbitrary third-party content. No browser code path
// calls it either, so the gate costs nothing and closes the exposure completely.
app.post('/api/tts', rateLimit(ttsLimiter), operatorOnly(async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ error: 'Text prompt is required' });
    }
    if (text.length > 2_000) {
      return res.status(413).json({ error: 'Text is too long to synthesize (2000 character limit)' });
    }
    const voice = typeof body.voice === 'string' ? body.voice : 'Kore';
    const style = typeof body.style === 'string' ? body.style.slice(0, 120) : 'Professional';
    const personaId = PersonaRegistry.list().some((p) => p.id === body.personaId)
      ? String(body.personaId)
      : PersonaRegistry.list()[0]?.id ?? '';

    const { audio, mimeType } = await synthesizeSpeech(text, voice, style, personaId);
    if (!audio) {
      return res.status(502).json({ error: 'TTS provider returned no audio', detail: 'empty_audio' });
    }
    res.json({ audio, mimeType });
  } catch (err: any) {
    console.error('[tts] Error:', err);
    res.status(502).json({ error: 'TTS provider error', detail: err?.message });
  }
}));

// ───────────────────────────── WebSocket relay ─────────────────────────────

const wss = new WebSocketServer({
  // SECTION 13: `noServer` is REQUIRED for the security gate to mean anything. When a
  // WebSocketServer is constructed with `{ server }`, the `ws` library attaches its own
  // `upgrade` listener to the HTTP server that calls `handleUpgrade` immediately, and it
  // never re-emits `upgrade` on the WebSocketServer. A `wss.on('upgrade', guard)` handler
  // is therefore dead code, and every cross-origin and token-less connection is accepted.
  // Owning the upgrade here guarantees the origin and token checks run before any socket
  // is created, and gives the Vercel function the same code path.
  noServer: true,
  path: '/live',
  // SECTION 15: bound a single frame at the transport level, in addition to the
  // application-level check in the protocol parser.
  maxPayload: PROTOCOL_LIMITS.MAX_FRAME_BYTES,
});

/**
 * Rejects an unauthenticated or cross-origin upgrade before the socket is accepted.
 *
 * This is the ONLY upgrade path. It is registered on the standalone server for local and
 * container deployments, and exported so the Vercel function can route platform upgrades
 * through the identical origin/token gate rather than re-implementing (and weakening) it.
 */
function handleLiveUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer
): void {
  // Anything that is not the live relay is not ours to answer.
  const pathname = (request.url ?? '').split('?')[0];
  if (pathname !== '/live') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const origin = request.headers.origin as string | undefined;
  const host = request.headers.host;

  const originOk = isOriginAllowed(origin, host);
  const auth = checkLiveAuth(request);

  if (!originOk || !auth.ok) {
    metrics.increment('unauthorized', !originOk ? 'bad_origin' : auth.reason ?? 'bad_token');
    console.warn(
      `[live] Rejected upgrade from ${origin ?? 'no-origin'} host=${host ?? 'none'}: ` +
        `${!originOk ? 'origin not allowed' : auth.reason}`
    );
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
}

httpServer.on('upgrade', handleLiveUpgrade);

wss.on('connection', (clientWs: WebSocket) => {
  let liveSession: any = null;
  let isClientActive = true;
let activeConnectionId: string | null = null;
let activeSessionId: string | null = null;
let activePersonaId: string | null = null;
/**
 * The operator's live prompt override, retained server-side for the life of the call.
 *
 * The override is applied to the provider's system instruction, which is provider-side state
 * that this server does not read back. Without keeping its own copy, any later re-assembly of
 * the prompt would silently drop an override the operator is still relying on.
 */
let activeInstructionOverride: string | null = null;
  let slot: ProjectSlot | null = null;
  let generation = 0;

  const sendToClient = (payload: Record<string, unknown>): void => {
    if (!isClientActive || clientWs.readyState !== WebSocket.OPEN) return;
    try {
      clientWs.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('[live] Failed to send frame to client:', err);
    }
  };

  /**
   * SECTION 10.4: provider teardown is idempotent. The provider's own onclose callback, an
   * explicit supersede, and a client disconnect can all fire, and the capacity counter must
   * only ever be decremented once.
   *
   * Note this deliberately does NOT touch `isClientActive`: the browser socket and the
   * provider session have independent lifetimes, and a replacement supersedes the provider
   * session without ending the caller's socket.
   */
  const teardownProviderSession = async (reason: string): Promise<void> => {
    const toRelease = slot;
    slot = null;
    toRelease?.release();

    if (activeSessionId && !liveSession) {
      // F-11: the provider session going away is not the call ending.
      //
      // Previously any provider close dropped the call outright. That is correct for a
      // terminal error, but a refresh, a network blip, or a GoAway-driven renewal all arrive
      // the same way at this point, and treating them as terminal is what forced the caller
      // to start over. The session is now left in the registry and the browser is told to
      // reattach, so the call can continue. It still expires on its own TTL, so a caller who
      // genuinely walks away does not leak an entry.
      metrics.closeSession(activeSessionId, reason);
    }

    const toClose = liveSession;
    liveSession = null;
    if (toClose) {
      try {
        await toClose.close();
      } catch (_) {
        // Provider close failures are not actionable; the socket is already gone.
      }
    }
  };

  /**
   * SECTION 09: execute one model-requested tool call and return the result.
   *
   * Every failure mode here is a chance for the agent to say something untrue, so each one is
   * turned into an explicit response rather than being swallowed:
   *
   * - an unknown tool is refused, since the model may hallucinate a capability;
   * - malformed arguments are refused before execution, because a booking tool given a
   *   nonsense time would otherwise create a real appointment at an impossible slot;
   * - a gateway failure is classified, so a provider outage is never spoken as a statement
   *   about the calendar.
   *
   * The response always goes back to the model, including on failure. A dropped call leaves
   * the model waiting, and a model left waiting tends to invent the answer.
   */
  const handleToolCall = async (
    toolCall: { functionCalls?: Array<{ id?: string; name?: string; args?: unknown }> },
    config: { sessionId: string; personaId: string; connectionId: string }
  ): Promise<void> => {
    const calls = toolCall.functionCalls ?? [];

    /**
     * F-22: every tool failure the model is shown goes through the one declared taxonomy.
     *
     * These three failures used to be hand-written strings. That left a tool call that was
     * refused *before* the gateway - unknown tool, bad arguments, a throw during dispatch -
     * unclassified, unrecorded, and carrying a recovery action invented at the call site, so
     * the model could be told "do not claim it was performed" for a typo in a tool name and
     * also for a genuine outage, with nothing distinguishing them. Routing them through
     * `ErrorManager` gives them the same classification, audit record, caller-safe line and
     * recovery action as a failure raised inside the gateway, which is the only reason for
     * having a taxonomy: one answer to "what happened and what now".
     */
    const respondWithFailure = (
      callId: string,
      name: string,
      toolError: { code: string; message: string }
    ): void => {
      const handled = ErrorManager.handleToolFailure(toolError as any, {
        sessionId: config.sessionId,
        personaId: config.personaId,
        connectionId: config.connectionId,
      });
      metrics.increment('tool_failed', name || 'unnamed');
      liveSession?.sendClientContent({
        functionResponses: [
          {
            id: callId,
            name: name || 'unknown',
            response: toFunctionResponse({
              success: false,
              error: { code: toolError.code, message: toolError.message, retryable: handled.error.retryable } as any,
              details: {
                auraCode: handled.error.code,
                category: handled.error.category,
                source: handled.error.source,
                retryable: handled.error.retryable,
                recoveryAction: handled.action.action,
                spokenMessage: handled.spokenMessage,
              },
            }),
          },
        ],
      } as any);
    };

    for (const call of calls) {
      const callId = call.id ?? `${config.connectionId}_${Date.now()}`;
      const name = call.name ?? '';

      metrics.increment('tool_call', name || 'unnamed');

      if (!name || !ToolGateway.isImplemented(name)) {
        console.warn(`[live] Model requested unknown tool "${name}" for ${config.sessionId}; refusing.`);
        respondWithFailure(callId, name, {
          code: 'NOT_FOUND',
          message: 'The model requested a capability that does not exist.',
        });
        continue;
      }

      const validation = validateToolArguments(name, call.args);
      if (!validation.valid) {
        console.warn(`[live] Rejected malformed "${name}" call: ${validation.reason}`);
        respondWithFailure(callId, name, {
          code: 'VALIDATION_ERROR',
          message: validation.reason || 'Tool arguments were malformed.',
        });
        continue;
      }

      try {
        const result = await ToolGateway.execute(name, validation.value, {
          sessionId: config.sessionId,
          personaId: config.personaId,
          connectionId: config.connectionId,
        });
        metrics.increment(result.success ? 'tool_ok' : 'tool_failed', name);
        liveSession?.sendClientContent({
          functionResponses: [{ id: callId, name, response: toFunctionResponse(result) }],
        } as any);
      } catch (err: any) {
        console.error(`[live] Tool "${name}" threw during dispatch:`, err);
        respondWithFailure(callId, name, {
          code: 'INTERNAL_ERROR',
          message: err?.message || 'Internal tool execution error',
        });
      }
    }
  };

  /**
   * SECTION 12: the server composes the authoritative prompt.
   *
   * The client sends only `personaId`, a bounded `instructionOverride`, and an untrusted
   * `sessionMemory`. Anything else it posts is ignored.
   */
  const startLiveSession = async (config: {
    connectionId: string;
    sessionId: string;
    personaId: string;
    voice: string;
    instructionOverride: string | null;
    sessionMemory: string;
    isReconnect: boolean;
    resumptionHandle?: string | null;
    preferProjectId?: string;
  }): Promise<void> => {
    if (!isClientActive) return;

    let assembled: ReturnType<typeof PromptAuthority.assemble>;
    try {
      assembled = PromptAuthority.assemble({
        personaId: config.personaId,
        sessionId: config.sessionId,
        connectionId: config.connectionId,
        isRecovery: config.isReconnect,
        sessionMemory: config.sessionMemory,
        instructionOverride: config.instructionOverride,
      });
    } catch (err: any) {
      // Refuse to start a session with an unverified business identity.
      metrics.increment('rejected_frame', 'unknown_persona');
      sendToClient({
        type: 'error',
        connectionId: config.connectionId,
        code: 'unknown_persona',
        message: err?.message ?? 'Unknown persona',
      });
      return;
    }

    await teardownProviderSession('superseded');

    if (!isClientActive || clientWs.readyState !== WebSocket.OPEN) {
      return;
    }

    // F-11: resolve the call's continuity *before* the record is overwritten.
    //
    // `config.isReconnect` only covers a transport blip inside a live page. A browser
    // refresh destroys the socket and constructs a brand new client, which sends
    // `isReconnect: false` because from its point of view it is starting a new call. The
    // server is the only party that knows the call was already in progress, so the decision
    // to suppress the greeting is made here, from the registry, rather than inferred by the
    // client.
    //
    // This is the bug that made a refresh audibly restart the call: the caller heard the
    // agent introduce itself a second time and had to repeat everything.
    const sessionRegistry = getSessionRegistry();
    const knownBeforeAttach = sessionRegistry.get(config.sessionId);
    const resumeHint = sessionRegistry.resumeHint(config.sessionId);
    const isResuming = Boolean(config.isReconnect || knownBeforeAttach);
    // A call that was greeted once never greets again, however it reattaches.
    const suppressGreeting = config.isReconnect || Boolean(resumeHint?.suppressGreeting);

    // The persona is the identity of the call, so it is bound to the `sessionId` for its whole
    // life. A reconnect that presents a *different* known persona is asking the server to
    // continue one call's greeting history, memory, and stage under another business's identity,
    // which would let a client re-brand an in-progress conversation. Refuse it: the client gets a
    // specific error and is expected to start a fresh session id, which is exactly what the
    // persona boundary in the UI already does.
    if (sessionRegistry.personaMismatch(config.sessionId, config.personaId)) {
      metrics.increment('unauthorized', 'persona_locked');
      sendToClient({
        type: 'error',
        connectionId: config.connectionId,
        code: 'persona_locked',
        message: 'This call is already established with a different persona. Start a new call.',
      });
      return;
    }

    const sessionRecord = sessionRegistry.attach(config.sessionId, config.personaId);
    if (isResuming && !config.isReconnect) {
      // Counted separately from a same-page reconnect: this is a call recovered across a
      // page load, which is the case that was previously invisible.
      sessionRegistry.markRecovered(config.sessionId);
      metrics.increment('session_resumed');
    }

    generation += 1;
    activeConnectionId = config.connectionId;
    activeSessionId = config.sessionId;
    activePersonaId = config.personaId;

    // SECTION 10 & 11: Multi-Project Cluster Acquisition
    const pool = GeminiProjectPool.getInstance();
    slot = pool.acquireSlot({ preferProjectId: config.preferProjectId });
    // F-13: never silently fall back to the single shared `ai` client. A null slot means
    // every project is saturated or in cooldown, and quietly reusing the shared key would
    // (a) hide the exhaustion, so no metric ever records it, and (b) let callers stampede
    // one quota-limited project, which is exactly the failure the pool exists to prevent.
    // Surface real capacity exhaustion instead, and let the client retry.
    if (!slot) {
      // A real observation of capacity exhaustion, recorded so readiness reflects it rather
      // than assuming the provider is fine because nobody has asked yet.
      DependencyHealth.updateStatus('GeminiLive', 'DEGRADED', 'all projects saturated or in cooldown');
      sendToClient({
        type: 'error',
        connectionId: config.connectionId,
        code: 'no_capacity',
        message: 'All Gemini projects are at capacity. Please retry shortly.',
      });
      return;
    }
    DependencyHealth.updateStatus('GeminiLive', 'HEALTHY', `acquired project slot for ${config.sessionId}`);
    const projectId = slot.project.config.id;
    const clientToUse = slot.project.client;
    const connectStartTime = Date.now();

    try {
      // Typed deliberately, not `any`. `any` here is what allowed a malformed `tools` payload
      // to compile and ship: the assignment of a bare declaration array to a field the SDK
      // declares as `(Tool | CallableTool)[]` is a type error, and the compiler would have
      // said so.
      const liveConfig: LiveConnectConfig = {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: config.voice || 'Kore' },
          },
        },
        outputAudioTranscription: {},
        // F-15: without input transcription the model can hear the caller but the server
        // never learns what was said. That defeats the entire premise of the confirmation
        // and business-accuracy guarantees: a booking tool can be called for something the
        // caller never said, and nothing on the server can be checked against the caller.
        // The server-side transcript is the authoritative record of the caller's own words,
        // independent of whatever the client reports in `client_content`.
        inputAudioTranscription: {},
        // SERVER-OWNED. Includes the persona, the business facts, the strict authority
        // rules, the fenced memory block, and the recovery-continuation directive.
        systemInstruction: assembled.systemInstruction,
      };

      // SECTION 09: give the model the tools this persona is actually allowed to use.
      //
      // Without this the live session had no way to reach ToolGateway at all: the tools were
      // implemented and tested, but the model was never told they existed, so any booking
      // request produced a spoken answer with no calendar behind it. Declarations are derived
      // from the real registry, and only tools that can genuinely run on this deployment are
      // advertised, so the model is never able to promise a confirmation or transfer that
      // cannot happen.
      const activePersona = PersonaRegistry.get(config.personaId);
      const toolDeclarations = buildToolDeclarations(config.personaId, activePersona);
      if (toolDeclarations.length > 0) {
        // The SDK wants `ToolListUnion = (Tool | CallableTool)[]`, and a `Tool` is a container
        // that *holds* declarations - not a declaration itself. These were previously assigned
        // as a bare `Array<{name, description, parameters}>`, which satisfies no member of that
        // union: the entries carry no recognised tool discriminator, so the provider is handed
        // objects that are not tools. The type did not catch it because `liveConfig` was typed
        // `any`, and no test asserted the shape, so the suite was green while the model was
        // still being told nothing about the tools - precisely the F-15 failure the comment
        // above this line describes. The wrapping is now asserted by a test.
        liveConfig.tools = [{ functionDeclarations: toolDeclarations }];
      }

      // SECTION 07: Gemini Session Resumption
      if (config.resumptionHandle) {
        console.log(
          `[Gemini Live] Resuming provider session for ${config.sessionId} with handle ${config.resumptionHandle.substring(0, 8)}...`
        );
        liveConfig.sessionResumption = { handle: config.resumptionHandle };
      } else {
        // Request session resumption tokens from the provider so future reconnects can resume.
        liveConfig.sessionResumption = {};
      }

      let resolveSetup: (() => void) | null = null;
      // F-16: a fixed sleep is a guess about the provider's setup latency, and a guess that
      // is wrong in the slow direction silently drops the greeting, or in the fast direction
      // sends the trigger before the session can accept input. The provider sends an
      // explicit `setupComplete` message, so wait for that instead, with a timeout so a
      // provider that never reports readiness cannot hang the session forever.
      const setupReady = new Promise<void>((resolve) => {
        resolveSetup = resolve;
      });
      const setupTimeout = new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), SETUP_READY_TIMEOUT_MS).unref?.();
      });

      const liveCallbacks = {
        onmessage: (message: any) => {
          if (message?.setupComplete) {
            resolveSetup?.();
          }
          if (!isClientActive || clientWs.readyState !== WebSocket.OPEN) return;

          // SECTION 09: tool call round-trip.
          //
          // A function call is a request from the model, and its arguments are untrusted
          // input like any other. They are validated before execution, dispatched through
          // the gateway that enforces persona authorization, and the response is returned to
          // the model so it can speak a truthful answer. Nothing here can be skipped, which
          // is why this lives in the message handler rather than in a separate poller.
          if (message.toolCall) {
            void handleToolCall(message.toolCall, config);
            return;
          }

          // Session Resumption Updates (Section 07)
          if (message.sessionResumptionUpdate) {
            const { newHandle, resumable } = message.sessionResumptionUpdate;
            sendToClient({
              type: 'session_resumption_update',
              connectionId: activeConnectionId,
              handle: newHandle || null,
              resumable: Boolean(resumable),
            });
          }

          // Proactive GoAway Signals (Section 08)
          if (message.goAway) {
            if (projectId) {
              pool.recordGoAway(projectId);
            }
            sendToClient({
              type: 'goaway',
              connectionId: activeConnectionId,
              timeRemaining: message.goAway.timeRemaining,
            });
          }

          // Audio output chunks
          const audioPart = message.serverContent?.modelTurn?.parts?.find((p: any) => p.inlineData?.data);
          if (audioPart?.inlineData?.data) {
            metrics.trackAudio('out');
            sendToClient({
              type: 'audio',
              connectionId: activeConnectionId,
              data: audioPart.inlineData.data,
              mimeType: audioPart.inlineData.mimeType,
            });
          }

          // Text transcription
          const textContent =
            message.serverContent?.outputTranscription?.text ||
            message.serverContent?.modelTurn?.parts?.[0]?.text;
          if (textContent) {
            sendToClient({
              type: 'transcript',
              connectionId: activeConnectionId,
              speaker: 'agent',
              text: textContent,
            });
          }

          // F-15: the caller's own words, transcribed by the provider rather than
          // asserted by the client. Forwarded so the UI shows both sides of the call.
          const callerText = message.serverContent?.inputTranscription?.text;
          if (callerText) {
            sendToClient({
              type: 'transcript',
              connectionId: activeConnectionId,
              speaker: 'caller',
              text: callerText,
            });
          }

          // User interruption
          if (message.serverContent?.interrupted) {
            sendToClient({ type: 'interrupted', connectionId: activeConnectionId });
          }
        },
        onerror: (err: any) => {
          const message = err?.message || String(err);
          console.error('[Gemini Live] error:', message);
          if (projectId) {
            pool.markUnhealthy(projectId, message, (err as any)?.code);
          }
          sendToClient({
            type: 'error',
            connectionId: activeConnectionId,
            message: message || 'Live session error',
          });
        },
        onclose: (e: any) => {
          const reason = e?.reason || 'normal';
          console.log(
            `[Gemini Live] session closed for connection ${activeConnectionId} (code: ${e?.code}, reason: ${reason})`
          );
          // The slot is released through the idempotent release function, so an
          // explicit teardown plus this callback cannot double-count.
          const toRelease = slot;
          slot = null;
          toRelease?.release();
          if (activeSessionId) {
            metrics.closeSession(activeSessionId, reason);
          }
          if (isClientActive && clientWs.readyState === WebSocket.OPEN) {
            sendToClient({
              type: 'status',
              connectionId: activeConnectionId,
              state: 'disconnected',
              code: e?.code,
              reason,
            });
          }
        },
      };

      try {
        liveSession = await clientToUse.live.connect({
          model: LIVE_MODEL,
          config: liveConfig,
          callbacks: liveCallbacks,
        });
      } catch (connectErr: any) {
        if (config.resumptionHandle) {
          console.warn(
            `[Gemini Live] Resumption with handle failed for ${config.sessionId} (${connectErr?.message}); falling back to clean session with memory context.`
          );
          liveConfig.sessionResumption = {};
          liveSession = await clientToUse.live.connect({
            model: LIVE_MODEL,
            config: liveConfig,
            callbacks: liveCallbacks,
          });
        } else {
          throw connectErr;
        }
      }

      const connectLatency = Date.now() - connectStartTime;
      if (projectId) {
        pool.markHealthy(projectId, connectLatency);
      }

      if (!isClientActive || clientWs.readyState !== WebSocket.OPEN) {
        // Client vanished while we were connecting: tear down immediately instead of
        // leaving an orphaned provider session holding a project slot.
        await teardownProviderSession('client_vanished_during_connect');
        return;
      }

      metrics.registerSession({
        sessionId: config.sessionId,
        connectionId: config.connectionId,
        personaId: config.personaId,
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
        generation,
        reconnects: config.isReconnect ? 1 : 0,
        audioChunks: 0,
        inputChars: config.sessionMemory.length,
        active: true,
      });
      if (config.isReconnect) {
        metrics.recordReconnect();
      } else if (!isResuming) {
        metrics.increment('session_started');
      }

      sendToClient({
        type: 'status',
        connectionId: config.connectionId,
        state: 'connected',
        projectId,
        personaId: activePersonaId,
        personaVersion: assembled.authority.personaVersion,
      });

      // SECTION 10: tell the caller when the call continues rather than restarting. The UI
      // needs this to explain an unplanned pause, and the agent needs it to stay quiet
      // instead of re-introducing itself.
      if (resumeHint && isResuming) {
        sendToClient({
          type: 'session_resumed',
          connectionId: config.connectionId,
          sessionId: config.sessionId,
          personaId: sessionRecord.personaId,
          stage: sessionRecord.stage,
          suppressGreeting,
          recoveries: sessionRecord.recoveries,
          notice: resumeHint.notice,
        });
      }

      // SECTION 10: once the caller has heard the introduction, it is never replayed. This
      // is the single decision point for that, and it covers both same-page reconnects and
      // a refresh, which arrive with different `isReconnect` values but the same intent.
      if (liveSession && !suppressGreeting) {
        sessionRegistry.markGreeted(config.sessionId);
        const readiness = await Promise.race([setupReady, setupTimeout]);
        if (readiness === 'timeout') {
          // Never silently skip the greeting: the caller would hear nothing and assume the
          // line dropped. Log it loudly, then still attempt the trigger.
          console.warn(
            `[live] Provider did not report setupComplete within ${SETUP_READY_TIMEOUT_MS}ms ` +
              `for ${config.sessionId}; sending the greeting trigger anyway.`
          );
        }
        if (!isClientActive || clientWs.readyState !== WebSocket.OPEN) {
          await teardownProviderSession('client_vanished_before_greeting');
          return;
        }
        try {
          liveSession.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [
                  {
                    text:
                      `(System trigger: greet the caller now in your persona as a front-desk receptionist. ` +
                      `Use this wording, adapted naturally to your style: "${assembled.greetingPrompt}")`,
                  },
                ],
              },
            ],
            turnComplete: true,
          });
        } catch (greetErr) {
          console.warn('[live] Initial greeting trigger warning:', greetErr);
        }
      }
    } catch (err: any) {
      console.error('[live] Failed to initialize Gemini Live connection:', err?.message || err);
      if (projectId) {
        pool.markUnhealthy(projectId, err?.message || 'connect_failed', (err as any)?.code);
      }
      const toRelease = slot;
      slot = null;
      toRelease?.release();
      sendToClient({
        type: 'error',
        connectionId: config.connectionId,
        code: 'live_connect_failed',
        message: err?.message || 'Failed to connect to Live API',
      });
    }
  };

  clientWs.on('message', (rawMsg: RawData) => {
    void (async () => {
      const bytes = typeof rawMsg === 'string' ? Buffer.byteLength(rawMsg) : (rawMsg as Buffer).length;
      metrics.trackBytes('in', bytes);

      const parsed = parseClientFrame(rawMsg as Buffer);
      if (!parsed.ok) {
        metrics.increment('rejected_frame', parsed.reason);
        sendToClient({
          type: 'protocol_error',
          code: 'invalid_frame',
          field: parsed.field,
          message: parsed.reason,
        });
        return;
      }

      const msg = parsed.value;
      if (msg.type === 'ping') {
        sendToClient({ type: 'pong' });
        return;
      }

      if (activeSessionId) {
        metrics.updateSession(activeSessionId, { lastActivityAt: Date.now() });
      }

      switch (msg.type) {
        case 'init_session': {
          const init = msg as InitSessionCommand;

          // A caller must not be able to name a persona the registry does not contain.
          // `PersonaRegistry.get()` falls back to `aura-salon` for an unknown id, so an
          // unvalidated value would silently put a caller in front of the wrong business:
          // the salon answering a dentist's caller, with the salon's hours, prices and
          // services. The client would show a persona it never got, and nothing anywhere
          // would report the mismatch. Rejecting is the only honest outcome.
          if (!PersonaRegistry.has(init.personaId)) {
            metrics.increment('unauthorized', 'unknown_persona');
            console.warn(
              `[live] Rejected init for session ${init.sessionId}: unknown persona "${init.personaId}".`
            );
            sendToClient({
              type: 'error',
              code: 'unknown_persona',
              message: 'Unknown persona',
            });
            return;
          }

          activeInstructionOverride = init.instructionOverride;
          await startLiveSession({
            connectionId: init.connectionId,
            sessionId: init.sessionId,
            personaId: init.personaId,
            voice: init.voice,
            instructionOverride: init.instructionOverride,
            sessionMemory: init.sessionMemory,
            isReconnect: false,
          });
          return;
        }

        case 'reconnect_session': {
          const reconnect = msg as ReconnectSessionCommand;

          // The same rule as `init_session`, for the same reason. A reconnect is the path
          // where persona identity is easiest to get wrong, because the caller re-asserts it
          // from client state; silently resuming into a different business mid-call is worse
          // than refusing the resume.
          if (!PersonaRegistry.has(reconnect.personaId)) {
            metrics.increment('unauthorized', 'unknown_persona');
            console.warn(
              `[live] Rejected reconnect for session ${reconnect.sessionId}: ` +
                `unknown persona "${reconnect.personaId}".`
            );
            sendToClient({
              type: 'error',
              code: 'unknown_persona',
              message: 'Unknown persona',
            });
            return;
          }

          console.log(
            `[live] Restoring connection for session ${reconnect.sessionId} ` +
              `(connection ${reconnect.connectionId}, resumption ${reconnect.resumptionHandle ? 'YES' : 'NO'})`
          );
          metrics.increment('replacement_requested', 'client_reconnect');
          activeInstructionOverride = reconnect.instructionOverride;
          await startLiveSession({
            connectionId: reconnect.connectionId,
            sessionId: reconnect.sessionId,
            personaId: reconnect.personaId,
            voice: reconnect.voice,
            instructionOverride: reconnect.instructionOverride,
            sessionMemory: reconnect.sessionMemory,
            isReconnect: true,
            resumptionHandle: reconnect.resumptionHandle,
          });
          return;
        }

        case 'configure': {
          // SECTION 15: `configure` must NOT reconnect. It is a voice/instruction change
          // on an existing session. Reconnecting here used to drop the caller mid-call and
          // reset the conversation.
          if (!liveSession) {
            sendToClient({ type: 'error', code: 'no_live_session', message: 'No live session to configure' });
            return;
          }
          try {
            if (msg.voice) {
              await liveSession.updateConfig({
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: msg.voice } } },
              });
            }
            if (msg.instructionOverride !== undefined && activePersonaId && activeSessionId) {
              const reAssembled = PromptAuthority.assemble({
                personaId: activePersonaId,
                sessionId: activeSessionId,
                connectionId: activeConnectionId ?? 'unknown',
                isRecovery: true,
                sessionMemory: null,
                instructionOverride: msg.instructionOverride,
              });
              activeInstructionOverride = msg.instructionOverride;
              await liveSession.updateConfig({ systemInstruction: reAssembled.systemInstruction });
            }
            sendToClient({ type: 'configured', connectionId: activeConnectionId });
          } catch (err: any) {
            console.warn('[live] configure failed:', err?.message);
            sendToClient({ type: 'error', code: 'configure_failed', message: err?.message });
          }
          return;
        }

        // F-28: the operator erased this call's memory, so the live prompt must stop
        // asserting it.
        //
        // Without this the browser and the provider disagreed for the rest of the call: the UI
        // showed a clean slate while the model kept working from facts the operator had
        // explicitly erased, and could quote a deleted phone number back to the caller. The
        // prompt is re-assembled with no memory so the two sides agree.
        case 'session_memory_reset': {
          if (!activePersonaId || !activeSessionId || !liveSession) {
            sendToClient({ type: 'error', code: 'no_live_session', message: 'No live session to reset' });
            return;
          }
          try {
            const reassembled = PromptAuthority.assemble({
              personaId: activePersonaId,
              sessionId: activeSessionId,
              connectionId: activeConnectionId ?? 'unknown',
              isRecovery: false,
              // `null` is the reset: the browser owns its memory, and the server keeps none
              // of the caller's words once the operator has asked for them to be forgotten.
              sessionMemory: null,
              // The operator's own prompt override survives. Forgetting the caller's details
              // is not a request to discard the operator's instructions, and resetting one
              // while silently reverting the other would look like the app lost their
              // customisation.
              instructionOverride: activeInstructionOverride,
            });
            await liveSession.updateConfig({ systemInstruction: reassembled.systemInstruction });
            console.log(`[live] Memory reset applied for session ${activeSessionId}.`);
            sendToClient({ type: 'memory_reset_confirmed', connectionId: activeConnectionId });
          } catch (err: any) {
            console.warn('[live] memory reset failed:', err?.message);
            sendToClient({ type: 'error', code: 'memory_reset_failed', message: err?.message });
          }
          return;
        }

        case 'silence_check': {
          if (!liveSession) return;
          try {
            liveSession.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `(System: The caller has been silent. Please speak this check-in message naturally: "${msg.prompt}")`,
                    },
                  ],
                },
              ],
              turnComplete: true,
            });
          } catch (err) {
            console.warn('[live] Silence check prompt error:', err);
          }
          return;
        }

        case 'realtime_input': {
          if (!liveSession) return;
          metrics.trackAudio('in');
          try {
            liveSession.sendRealtimeInput({
              audio: { data: msg.pcmBase64, mimeType: 'audio/pcm;rate=16000' },
            });
          } catch (err) {
            console.warn('[live] Realtime audio chunk error:', err);
          }
          return;
        }

        case 'client_content': {
          if (!liveSession) return;
          try {
            liveSession.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [{ text: msg.text }],
                },
              ],
              turnComplete: true,
            });
          } catch (err) {
            console.warn('[live] Client content error:', err);
          }
          return;
        }

        default:
          return;
      }
    })();
  });

  clientWs.on('close', (code, reason) => {
    isClientActive = false;
    metrics.increment('client_closed', reason?.toString());
    void teardownProviderSession(`client_closed:${code}`);
  });

  clientWs.on('error', (err) => {
    console.warn('[live] client socket error:', err.message);
  });
});

// Prune closed sessions so the registry does not grow without bound.
const sweepTimer = setInterval(() => metrics.sweep(), 60_000);
sweepTimer.unref?.();

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // F-35: this matched `vite.config.ts` only by accident, and it hardcoded HMR off. The
        // same `DISABLE_HMR` switch now drives both, so a developer gets hot reload by default
        // and a sandboxed preview can still turn it off with one variable.
        hmr: process.env.DISABLE_HMR === 'true' ? false : { overlay: false },
      },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/live')) {
        return next();
      }
      try {
        const template = await vite.transformIndexHtml(
          req.originalUrl,
          await import('fs').then((fs) => fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8'))
        );
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    // Production static serving
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  // F-51: for the standalone process the boot problems are fatal and exiting is the correct,
  // visible behaviour - the operator is watching this terminal. The function path deliberately
  // does NOT exit, so its diagnostic routes stay able to answer.
  if (bootProblems.length > 0) {
    console.error(
      `[boot] Refusing to start: ${bootProblems.length} configuration problem(s) found. ` +
        'Fix the above and restart.'
    );
    process.exit(1);
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[boot] Server listening on http://localhost:${PORT} (${process.env.NODE_ENV ?? 'development'})`);
    console.log(`[boot] Live model: ${LIVE_MODEL}`);
    console.log(
      liveAuthConfigured()
        ? '[boot] Live relay: shared-secret token REQUIRED.'
        : '[boot] Live relay: same-origin only (set AURA_LIVE_TOKEN to require a token).'
    );
    const extra = allowedOrigins();
    if (extra.size > 0) {
      console.log(`[boot] Additional allowed origins: ${[...extra].join(', ')}`);
    }
    // Printed on every boot, on every instance, before any call is taken. A topology problem
    // that only surfaces when two customers book the same slot is a problem discovered far
    // too late; this makes it a line in the log instead.
    console.log(describeTopology());
  });
}

// ───────────────────────────── Entrypoints ─────────────────────────────

/**
 * SECTION 16: Deployment entrypoints.
 *
 * The same application serves two very different hosts:
 *
 * - `npm run dev` / `npm start`: a long-lived Node process that calls `httpServer.listen`.
 * - Vercel: a serverless function that imports the app and lets the platform own the
 *   listener. Importing this module MUST NOT therefore start a listener, otherwise the
 *   function would bind a port it does not control and the WebSocket upgrade would never
 *   reach the platform.
 *
 * `api/index.ts` imports `app` and the relay; the listener only starts when this file is
 * the process entrypoint.
 */
export { app, httpServer, metrics, wss, startServer, handleLiveUpgrade };

/** True when this file was executed directly rather than imported as a module. */
function isEntrypoint(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return import.meta.url === pathToFileURL(invoked).href;
  } catch {
    return false;
  }
}

/**
 * F-52: whether this process should bind a listener.
 *
 * `isEntrypoint()` alone is NOT sufficient, and relying on it was why the deployment returned
 * `500 FUNCTION_INVOCATION_FAILED` on every single route.
 *
 * The check compares `import.meta.url` against `pathToFileURL(process.argv[1])`. On Vercel this
 * module is bundled by esbuild into one CommonJS file, and the bundler rewrites `import.meta.url`
 * into a shim derived from `__filename` - the very file that `process.argv[1]` points at. The two
 * therefore compare EQUAL inside the function, `isEntrypoint()` wrongly answered "yes", and
 * `startServer()` ran inside a serverless invocation: it bound port 3000 that the platform does
 * not control and, on any boot problem, called `process.exit(1)`. Every request died at import,
 * which is exactly the `FUNCTION_INVOCATION_FAILED` this project kept reporting, while the static
 * build still served a page that looked like a working site with a dead backend.
 *
 * The platform tells us directly which host we are on, so we stop inferring it. Vercel sets
 * `VERCEL=1` on every function invocation, and `PersistenceTopology` already keys off the same
 * variable. This check is deterministic; `isEntrypoint()` is a heuristic and stays as a fallback
 * only for the local process.
 */
function shouldStartListener(): boolean {
  // The platform owns the listener here. Never bind, and never exit, inside a function.
  if (process.env.VERCEL) return false;
  return isEntrypoint();
}

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled rejection:', reason);
});

if (shouldStartListener()) {
  startServer().catch((err) => {
    console.error('[fatal] Server failed to start:', err);
    process.exit(1);
  });
}
