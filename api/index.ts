/**
 * Vercel Function entrypoint.
 *
 * This file is the reason `vercel.json` had rewrites pointing at a path that did not exist: the
 * server was written to be importable, `server.ts` documents that "api/index.ts imports `app` and
 * the relay", and the function itself was never created. On Vercel that meant every API route
 * 404'd while the static build still served, which looks like a working site with a dead backend.
 *
 * ## Why the relay is routed rather than reimplemented
 *
 * The upgrade gate in `server.ts` (`handleLiveUpgrade`) enforces the origin allowlist and the
 * relay token *before* a socket exists. That is the security boundary for a route that can
 * spend a Gemini API key. This adapter therefore obtains the platform's upgrade primitives and
 * hands them to that same function, so a Vercel deployment cannot drift from the local one into
 * a weaker check. Re-implementing the gate here would be a second copy of the most important
 * guard in the codebase, and the second copy is the one nobody tests.
 *
 * ## Vercel platform facts this file is shaped by
 *
 * - Vercel owns the listener. `server.ts` only calls `httpServer.listen` when it is the process
 *   entrypoint, so importing it here is side-effect free and does not bind a port the function
 *   does not control.
 * - A WebSocket upgrade is exposed through the request context
 *   (`Symbol.for('@vercel/request-context')`) rather than as a normal request/response pair.
 *   This is the same mechanism `@vercel/functions`' own `experimental_upgradeWebSocket` uses
 *   internally, reached directly so this project does not need to add a Vercel-only runtime
 *   dependency or take an experimental API as a hard production requirement.
 * - Function duration is capped by the plan, and a connection is pinned to the instance that
 *   accepted it. A reconnect may therefore land on a *different* instance, which is exactly the
 *   multi-instance condition `PersistenceTopology` already reports on. `/ready` reports it; this
 *   file does not pretend otherwise.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { Duplex } from 'stream';
import type { Request, Response } from 'express';

import { app, handleLiveUpgrade } from '../server';

/**
 * Vercel exposes the upgrade primitives on a request-scoped context hung off `globalThis` under
 * this well-known symbol. It is the documented integration point and the one `@vercel/functions`
 * reads, so depending on it directly is no more fragile than depending on that package.
 */
const VERCEL_REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

interface PlatformUpgrade {
  req: IncomingMessage;
  socket: Duplex;
  head: Buffer;
}

interface VercelRequestContext {
  upgradeWebSocket?: () => PlatformUpgrade;
}

/** Reads the platform upgrade primitives, or null when running outside Vercel. */
function platformUpgrade(): PlatformUpgrade | null {
  const holder = (globalThis as Record<symbol, unknown>)[VERCEL_REQUEST_CONTEXT] as
    | { get?: () => VercelRequestContext | undefined }
    | undefined;
  const ctx = holder?.get?.();
  if (!ctx || typeof ctx.upgradeWebSocket !== 'function') return null;
  try {
    return ctx.upgradeWebSocket();
  } catch (err) {
    // A failed upgrade handshake is a dead call, not a server fault. Log it and let the caller
    // see a refusal rather than a hung socket.
    console.error('[vercel] upgradeWebSocket() failed:', (err as Error)?.message ?? err);
    return null;
  }
}

/** True when this request is asking to be upgraded to a WebSocket. */
function isUpgradeRequest(req: IncomingMessage): boolean {
  if ((req.method ?? '').toUpperCase() !== 'GET') return false;
  const upgrade = req.headers.upgrade;
  return typeof upgrade === 'string' && upgrade.toLowerCase() === 'websocket';
}

/**
 * The path the browser actually asked for.
 *
 * A rewrite to this function rewrites `req.url` to the destination, so the original `/live` is
 * only visible in a header. `handleLiveUpgrade` refuses anything that is not `/live`, and that
 * refusal is load-bearing, so the original path has to be reconstructed rather than assumed.
 */
function originalPath(req: IncomingMessage): string {
  const header = req.headers['x-vercel-original-path'] ?? req.headers['x-matched-path'];
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value === 'string' && value.length > 0) return value.split('?')[0];
  return (req.url ?? '').split('?')[0];
}

/** Writes a plain HTTP refusal straight to the socket, since no response object is in play. */
function refuse(socket: Duplex, status: number, reason: string, detail: string): void {
  const body = JSON.stringify({ ready: false, error: reason, detail });
  socket.write(
    `HTTP/1.1 ${status} ${reason}\r\n` +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      'Connection: close\r\n\r\n' +
      body
  );
  socket.destroy();
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (isUpgradeRequest(req)) {
    const path = originalPath(req);
    if (path !== '/live') {
      // Not the relay. There is no other upgrade route, so this is not a route we can serve.
      if (res.socket) refuse(res.socket, 404, 'Not Found', `no upgrade route for ${path}`);
      return;
    }

    const upgrade = platformUpgrade();
    if (!upgrade) {
      // The platform did not offer an upgrade. Refusing with a diagnosable reason beats
      // completing the request and leaving the caller with a socket that never opens.
      if (res.socket) {
        refuse(
          res.socket,
          501,
          'Not Implemented',
          'This platform did not provide WebSocket upgrade primitives. WebSockets on Vercel require Fluid compute.'
        );
      }
      return;
    }

    // Restore the path the browser actually requested.
    //
    // A rewrite to this function rewrites the request URL to the destination (`/api/index.ts`),
    // and both the shared guard in `handleLiveUpgrade` and the `ws` server's own `path: '/live'`
    // option inspect that URL. Left as the rewrite artifact, every legitimate upgrade is rejected
    // with a 404 before a socket exists - the static site loads and every call fails to connect.
    // The original path was already validated as `/live` above, so this cannot widen the guard.
    upgrade.req.url = path;

    // Delegates to the single, shared origin + token gate. Synchronous by design: it either
    // completes the upgrade or destroys the socket.
    handleLiveUpgrade(upgrade.req, upgrade.socket, upgrade.head);
    return;
  }

  // Everything else - /health, /ready, /api/live-token, /api/metrics, /api/cluster/status and the
  // static fallback - is the same express application used by the standalone server, so there is
  // exactly one implementation of each of those routes.
  //
  // The cast is the honest type here: Vercel's Node runtime passes Node's
  // IncomingMessage/ServerResponse, and express augments both with its own `get`/`header`/`status`
  // helpers. The objects are the same objects; only express's declaration-merging view of them
  // differs.
  await new Promise<void>((resolve) => {
    app(req as Request, res as Response, () => {
      // Express signals "no route matched" by calling next(). Reaching here means the request
      // fell through every registered route, which must not look like a hang.
      if (!res.headersSent) {
        (res as Response).status(404).json({ ready: false, error: 'Not Found' });
      }
      resolve();
    });
    res.on('finish', () => resolve());
    res.on('close', () => resolve());
  });
}
