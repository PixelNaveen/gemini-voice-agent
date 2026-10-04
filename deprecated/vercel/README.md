# Deprecated Vercel Serverless Scaffolding

These files (api/index.ts, vercel.json, and verification scripts) were used for ephemeral serverless deployment on Vercel.
The repository has standardized on a dedicated long-running Node.js process (server.ts / server.mjs) managed via PM2 / Docker on a persistent VM (Oracle Cloud Infrastructure Always-Free Ampere A1).
Serverless execution is deprecated because in-memory session lifecycles, Gemini Live WebSockets, and booking journals require persistent process continuity.
