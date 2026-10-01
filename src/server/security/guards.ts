import type { Request, Response, NextFunction } from 'express';

/**
 * SECTION 13: Edge Security
 *
 * The relay and the TTS endpoints were previously open to anyone: no origin check on the
 * WebSocket upgrade, no rate limit on the TTS endpoints (an unauthenticated way to spend
 * the Gemini key), and a 10 MB JSON body limit on every route.
 */

// ───────────────────────────── Security headers ─────────────────────────────

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');

  // In development, Vite injects an inline React-refresh preamble script and uses eval for source maps.
  // In production, external Google Fonts (declared in index.html) are allowed for typography.
  const isDev = process.env.NODE_ENV !== 'production';
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "media-src 'self' blob: data:",
      "connect-src 'self' ws: wss: https: http:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  next();
}

// ───────────────────────────── Origin / host allowlist ─────────────────────────────

/**
 * Allowed WebSocket origins. Defaults to same-origin only. `AURA_ALLOWED_ORIGINS`
 * (comma separated) widens it for explicitly trusted front ends.
 */
export function allowedOrigins(): Set<string> {
  const configured = (process.env.AURA_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set(configured);
}

export function isOriginAllowed(origin: string | undefined, host: string | undefined): boolean {
  const extra = allowedOrigins();
  if (!origin) {
    // Non-browser clients (native apps, health probes) send no Origin. Accept only when
    // the deployment has deliberately opted in, otherwise reject.
    return process.env.AURA_ALLOW_MISSING_ORIGIN === 'true';
  }
  if (extra.has(origin)) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Verifies whether an HTTP request (like the token bootstrap GET) originates from the same origin.
 *
 * Browsers do not send an `Origin` header on same-origin `GET` requests. On such requests,
 * the origin is verified using `Sec-Fetch-Site` and the `Referer` header against the request's `Host`.
 * If an explicit `Origin` header is present (e.g. cross-origin fetch / WebSocket), it is
 * verified with `isOriginAllowed`.
 */
export function isHttpRequestSameOrigin(req: Request): boolean {
  const origin = req.headers.origin as string | undefined;
  const host = req.headers.host;
  if (origin) {
    return isOriginAllowed(origin, host);
  }
  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite === 'cross-site') {
    return false;
  }
  const referer = req.headers.referer as string | undefined;
  if (referer && host) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  if (secFetchSite === 'same-origin' || secFetchSite === 'none') {
    return true;
  }
  return isOriginAllowed(origin, host);
}

/**
 * Shared-secret gate for the WebSocket relay.
 *
 * Same-origin checking alone stops drive-by browser abuse but not a direct socket client
 * that is willing to lie about its `Origin`. When AURA_LIVE_TOKEN is set, the relay
 * additionally requires a matching token, which the browser receives as an HttpOnly cookie
 * from the same-origin bootstrap endpoint and hands over automatically on the upgrade.
 *
 * When the token is not set the relay is same-origin only, and that is logged loudly at
 * startup rather than left implicit.
 */
export function liveAuthConfigured(): boolean {
  return Boolean(process.env.AURA_LIVE_TOKEN && process.env.AURA_LIVE_TOKEN.length >= 16);
}

/**
 * Name of the cookie that carries the relay token to the browser.
 *
 * A browser cannot attach a custom header to a WebSocket handshake, so the token has to
 * travel some other way. A query parameter would work but leaks the secret into access
 * logs, proxy logs, and any `Referer` the page later sends. A cookie is sent automatically
 * on the upgrade request and stays out of every URL, so it is the only transport that is
 * both usable by a browser and invisible to logging.
 *
 * `HttpOnly` keeps the value away from page scripts, so a cross-site scripting bug cannot
 * read it. `SameSite=Strict` means the browser will not attach it to a cross-site request
 * initiated by another page, which is what stops a malicious origin from borrowing a
 * legitimate visitor's session.
 */
export const LIVE_TOKEN_COOKIE = '__Host-aura_live';

/** Minimal, allocation-light cookie header parser. */
function cookieValue(req: { headers: Record<string, unknown> }, name: string): string | null {
  const header = req.headers.cookie;
  if (typeof header !== 'string' || header.length === 0) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function liveTokenFromRequest(req: {
  headers: Record<string, unknown>;
  url?: string;
}): string | null {
  // Preferred for browsers: automatic, and absent from every log line.
  // Both names are accepted because the server issues the hardened `__Host-` form only when
  // the connection is genuinely secure, and a browser will reject a `__Host-` cookie that
  // is not `Secure`, which would otherwise break plain-http local development.
  for (const name of [LIVE_TOKEN_COOKIE, 'aura_live']) {
    const cookie = cookieValue(req, name);
    if (cookie && cookie.length > 0) return cookie;
  }

  // For non-browser clients that can set arbitrary headers, e.g. server-side integrations
  // and the verification scripts.
  const header = req.headers['x-aura-live-token'];
  if (typeof header === 'string' && header.length > 0) return header;

  // Query parameter last, and only for clients that have no other option. It is retained
  // for compatibility but is a genuine leak: the value is captured by server access logs,
  // any intermediary proxy, and browser history. Prefer the cookie.
  if (req.url) {
    const match = /[?&]token=([^&]*)/.exec(req.url);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  return null;
}

export function checkLiveAuth(req: { headers: Record<string, unknown>; url?: string }): { ok: boolean; reason?: string } {
  if (!liveAuthConfigured()) {
    // No token configured: rely on the origin check alone.
    return { ok: true };
  }
  const presented = liveTokenFromRequest(req);
  const expected = process.env.AURA_LIVE_TOKEN!;
  if (!presented) {
    return { ok: false, reason: 'missing live token' };
  }
  // Constant-time comparison to avoid leaking the token through response timing.
  if (presented.length !== expected.length) {
    return { ok: false, reason: 'invalid live token' };
  }
  let mismatch = 0;
  for (let i = 0; i < presented.length; i++) {
    mismatch |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0 ? { ok: true } : { ok: false, reason: 'invalid live token' };
}

// ───────────────────────────── Rate limiting ─────────────────────────────

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitOptions {
  /** Sustained requests allowed per window. */
  capacity: number;
  windowMs: number;
  name: string;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

/**
 * In-process token bucket keyed by client identity.
 *
 * Sufficient for a single Vercel instance. A multi-instance deployment must move this
 * state to a shared store; the key space here is per-process by design so it never
 * blocks the event loop on I/O.
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private lastSweep: number;
  private readonly clock: () => number;

  constructor(private readonly options: RateLimitOptions) {
    this.clock = options.now ?? (() => Date.now());
    this.lastSweep = this.clock();
  }

  public check(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const now = this.clock();
    this.sweep(now);

    const refillPerMs = this.options.capacity / this.options.windowMs;
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.options.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    if (elapsed > 0) {
      bucket.tokens = Math.min(this.options.capacity, bucket.tokens + elapsed * refillPerMs);
      bucket.lastRefill = now;
    }

    if (bucket.tokens < 1) {
      const deficit = 1 - bucket.tokens;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.ceil(deficit / refillPerMs),
      };
    }

    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterMs: 0 };
  }

  /** Drops idle buckets so memory does not grow with distinct client addresses. */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    const cutoff = now - this.options.windowMs * 4;
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastRefill < cutoff) this.buckets.delete(key);
    }
  }
  public get size(): number {
    return this.buckets.size;
  }

  public get name(): string {
    return this.options.name;
  }

  public get capacity(): number {
    return this.options.capacity;
  }
}

/** Best-effort client identity. Trusts X-Forwarded-For only when behind a proxy. */
export function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

export function rateLimit(limiter: RateLimiter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = limiter.check(clientKey(req));
    res.setHeader('X-RateLimit-Limit', String(limiter.capacity));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    if (!result.allowed) {
      res.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      res.status(429).json({ error: 'Too many requests. Please slow down.' });
      return;
    }
    next();
  };
}

/**
 * Guards the operator-only diagnostic endpoints.
 *
 * These routes were previously open to anyone, which is not a theoretical concern for two
 * of them specifically:
 *
 * - `/api/prompt-preview` returns the entire composed system prompt. That publishes the
 *   prompt-injection defences, the authority rules, and the business-fact injection format,
 *   which is effectively a roadmap for defeating them.
 * - `/api/sessions` and `/api/metrics` expose live session identifiers, persona usage, and
 *   internal error strings, which support reconnaissance and caller-activity correlation.
 *
 * `/health` deliberately stays open: an orchestrator cannot hold a credential, and the route
 * returns nothing sensitive.
 *
 * Gating reuses the operator credential already required for the relay, so there is a single
 * secret to manage rather than two. With no credential configured the routes stay reachable,
 * matching the relay's own same-origin-only posture in development.
 */
export function requireOperator(req: Request, res: Response): boolean {
  if (!liveAuthConfigured()) return true;
  const result = checkLiveAuth(req);
  if (result.ok) return true;
  res.status(401).json({ error: 'operator credential required' });
  return false;
}

/** Wraps a diagnostic handler so it only runs for a credentialed operator. */
export function operatorOnly<T extends Request>(handler: (req: T, res: Response) => void) {
  return (req: T, res: Response, _next: NextFunction): void => {
    if (!requireOperator(req as unknown as Request, res)) return;
    handler(req, res);
  };
}
