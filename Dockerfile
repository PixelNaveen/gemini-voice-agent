# F-41: a container definition for the Node relay.
#
# The app has two very different halves: a static Vite bundle and a long-lived Node server that
# owns the WebSocket relay, the Gemini sessions and the tool gateway. Vercel runs the second half
# as a serverless function, which works for HTTP but is a poor fit for long-lived live calls:
# a function has a request-scoped lifetime, so a call that outlives one invocation has nowhere
# to keep its provider session.
#
# This image runs the real server on a long-lived Node runtime, which is the shape the relay
# actually wants. It is therefore also the honest way to verify the audit's Vercel claims: the
# same `server.ts` runs in both, so anything that works here works there except for serverless
# lifetime and filesystem durability, which are called out as limits rather than papered over.

# ── Build stage: produce the static bundle with the full toolchain ────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first so a source-only change reuses the cached install layer.
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# `npm run build` is `vite build`. It writes `dist/`, which the runtime stage copies.
RUN npm run build

# Run the typecheck as part of the image build so a type error cannot reach production.
RUN npm run lint

# Bundle the server to a single ESM file.
#
# The server runs from TypeScript via `tsx`, which is a dev dependency. Rather than ship the
# whole toolchain in the runtime image, the server is bundled here with the esbuild that is
# already a transitive dependency. This also means the runtime image does not need the
# TypeScript sources, and the container does not depend on a dev-only loader at runtime.
#
# The bundle is written to `/app/server.mjs` rather than a subdirectory because the server
# resolves `dist/` and `index.html` relative to its own file location, so the bundle has to sit
# beside them.
RUN npx esbuild server.ts \
      --bundle \
      --platform=node \
      --target=node22 \
      --format=esm \
      --packages=external \
      --sourcemap \
      --outfile=server.mjs

# Drop dev dependencies from node_modules before it is copied forward.
RUN npm prune --omit=dev

# ── Runtime stage: production dependencies, the built bundle, and the server ──────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Run unprivileged. The `node` user ships with the base image.
RUN mkdir -p /app/dist /app/.data && chown -R node:node /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server.mjs ./server.mjs
COPY --from=build --chown=node:node /app/server.mjs.map ./server.mjs.map
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node

EXPOSE 3000

# The health endpoint is intentionally public and unauthenticated, which is what a platform
# probe needs. It reports process liveness and relay state, never credentials.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `--enable-source-maps` reads `server.mjs.map`, which the build stage emitted next to the
# bundle. The server's own error handling logs and continues rather than exiting, so a failed
# session teardown cannot take the process down mid-call.
CMD ["node", "--enable-source-maps", "server.mjs"]
