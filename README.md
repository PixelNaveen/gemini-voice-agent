# AURA // Voice AI Agent

A real-time voice receptionist. The browser streams microphone audio to a server-authoritative
relay, the relay holds the only Gemini Live session, and the model can call booking tools that
write through a single authoritative journal.

The design rule that everything else follows from: **the server is the authority.** The client
never decides persona, never issues tool calls, and never resolves a booking. It renders state and
carries audio. Everything a caller sees is derived from a server-acknowledged event, so a dropped
socket or a stale tab cannot show a booking the server never made.

## Running it

```bash
npm install
cp .env.example .env      # then set GEMINI_API_KEY
npm run dev
```

`npm run dev` runs the client and the relay together. The relay listens on `PORT` (default 3000)
and serves the built client from `dist/` once `npm run build` has run.

## Verifying it

```bash
npm run lint        # tsc --noEmit, strict
npm test            # unit + integration suite
npm run verify:all  # lint, tests, relay security, Vercel entrypoint, build
```

Two further checks exist because they need a real provider and a real socket, and so cannot be
faked by a unit test:

```bash
npm run verify:gemini   # credential and model reachability, real WebSocket
npm run verify:e2e      # full call: greeting, caller turn, real tool dispatch, audio out
```

`verify:e2e` fails on a silent answer. An earlier revision accepted a turn that produced only
`<no speech>` or `{pause}` markers, which is precisely the failure a user experiences as the agent
ignoring them.

### Diagnosing a live deployment

A successful build proves the code compiles and nothing more. Every deployment problem so far has
been invisible at build time and obvious in a single HTTP response, so check a live URL directly:

```bash
npm run verify:deployment -- https://your-deployment.vercel.app
```

This replays the four requests the browser actually makes, in order:

| Step                | Proves                                                   | Not this                                                 |
| ------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `/health`           | the function is running and `server.ts` imported cleanly   | —                                                        |
| `/ready`            | whether the instance believes it can serve a call, and why not | not a browser step; `/live` never consults it        |
| `/api/live-token`   | the HttpOnly relay cookie is issued                        | if this fails, the upgrade is refused 401                |
| `GET /live`         | the upgrade is accepted (101) or refused with a reason     | 501 means enable Fluid compute; no code can work around it |

It exits non-zero on any real failure, so it is safe to run in CI against a deployment. If the relay
requires a shared secret, pass it with `--token` or `AURA_LIVE_TOKEN`; it is never written to disk.

`/ready` returning `503 MULTI_INSTANCE_RISK` on Vercel is correct behaviour, not a fault: it is the
design refusing to claim it can safely accept a booking when it has no shared store. It does not
prevent calls, because `/live` does not consult it.

## Deploying

### The correct deployment: one instance

```bash
npm run build
npm start                                   # or: docker build -t aura . && docker run -p 3000:3000 --env-file .env aura
```

This is the deployment the persistence design assumes, and the one to use for real traffic.

Deciding "this slot is free" and claiming it has to be a single atomic read-modify-write. The
session, appointment, and tool-operation journals are authoritative only inside one process, so a
second instance that cannot see the first will accept the same 14:00 booking and tell two callers
they each hold it. A single long-lived Node process is what makes that impossible.

### Vercel: bounded demo only

A Vercel Function exists (`api/index.ts`, routed by `vercel.json`) and works, with two limits that
are properties of the platform rather than bugs to be fixed in code:

- **The filesystem is ephemeral and requests fan out across instances.** The relay detects this and
  refuses to report ready: `GET /ready` returns **503** with `persistence.topology =
  "MULTI_INSTANCE_RISK"`. That refusal is deliberate. A deployment that reports ready while able to
  double-book is worse than one that declines traffic. `AURA_ACK_MULTI_INSTANCE_PERSISTENCE=true`
  overrides it, which is an operator accepting duplicate bookings, not a fix.
- **WebSockets need Fluid compute**, and a function's maximum duration is capped. A long call
  outlasting the cap is severed and must reconnect; because the reconnect can land on a different
  instance, the resumed call may not see the first instance's journal.

To make Vercel genuinely correct, the five properties a replacement store must satisfy are written
out in `src/persistence/PersistenceTopology.ts`. A plain GET/SET pair does not meet them, because
claiming a slot and confirming it cannot be one operation.

## Environment

`.env.example` documents every variable. The ones that change behaviour rather than just config:

| Variable | Effect |
| --- | --- |
| `GEMINI_API_KEY` | Required. Provider access. |
| `AURA_LIVE_TOKEN` | Optional. When set, `/live` requires an HttpOnly same-origin cookie; the client bootstraps it and the secret never reaches page JS. |
| `AURA_SESSION_TTL_MS` | How long a call stays resumable. Default 5 minutes. |
| `AURA_DATA_DIR` | Journal location. Must be durable; instance-local. |
| `AURA_ACK_MULTI_INSTANCE_PERSISTENCE` | Lets a multi-instance platform pass readiness. Accepts duplicate bookings. |
| `AURA_REQUIRE_SHARED_STORE` | Removes that override, so readiness stays 503 even if it is set. |

Never commit `.env`. It is already ignored.

## Architecture notes

`AURA-ARCHITECTURE-AUDIT.md` records what was wrong, why, and what now prevents each defect from
returning — including the ones that are easy to reintroduce, such as sending a caller's turn into a
dying socket, letting a persona be rebound mid-call, and extracting a "name" from the first two
words after "I am".
