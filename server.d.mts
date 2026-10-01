/**
 * Type surface of the bundled server artifact (`server.mjs`).
 *
 * ## Why this file exists
 *
 * `api/index.ts` must import the server with a *file extension*, because the deployed
 * `api/index.js` runs as native ESM on Node 22. Native ESM has no extension-guessing fallback:
 * a specifier like `'../server'` is resolved literally and fails with `ERR_MODULE_NOT_FOUND`,
 * since nothing on disk is named `server`. That is not a theoretical hazard - it is the exact
 * 500 that every API route returned while the static build served fine.
 *
 * The import therefore targets `'../server.mjs'`, the bundle produced by `npm run build:server`
 * (also the artifact the container runs, so Vercel and Docker stop drifting apart). That file is
 * generated, so TypeScript needs a declaration to typecheck the import.
 *
 * ## Why this is a re-export instead of hand-written signatures
 *
 * Every line here would otherwise be a copy of `server.ts` that silently rots the moment a
 * signature changes there. Re-exporting keeps the single source of truth as `server.ts`: this file
 * can never disagree with the implementation it describes.
 */
export { app, httpServer, metrics, wss, startServer, handleLiveUpgrade } from './server.js';
