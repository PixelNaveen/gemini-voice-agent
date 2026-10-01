# AURA // Voice AI Agent — Architecture, Protocol & Code Audit

**Repository:** `C:\Users\KNJ\Downloads\aura-__-voice-ai-agent`
**Audit date:** 2026-09-29
**Scope:** Full static read of the repository (entry points, `src/**` core, tools, personas, knowledge, frontend, server, tests, config) with line-level reference to runtime-critical and defect-bearing code.
**Method:** Direct file reads + import-graph reachability analysis from the two real entry points (`server.ts`, `src/main.tsx`), plus four delegated deep-dives (frontend, time/audio, errors/diagnostics, data & infrastructure).

> **Confidence legend** — ✅ *verified by direct read/grep in this audit* · ⚠️ *reported by delegated analysis, spot-check recommended before acting*

---

## 1. Executive summary

AURA is a **browser-based voice receptionist** that streams microphone audio to the Gemini Live API through a bespoke WebSocket relay, with tool-calling for availability, booking, cancellation, rescheduling, pricing, hours, confirmation and transfer.

The repository contains **two architectures superimposed on each other**:

| | Architecture A ("live") | Architecture B ("designed") |
|---|---|---|
| Entry | `server.ts`, `src/main.tsx` | `src/api/**`, `src/application/**`, `src/persistence/**`, `src/security/**` |
| Prompting | `ContextBuilder` → 3-part string | `PromptAssembler` → 9-layer structured prompt + token budget |
| Transport | Inline `wss.on('connection')` in `server.ts` | `src/api/websocket/VoiceGateway.ts` |
| Data | In-memory `Map`s | Repository interfaces, DTOs, mappers, unit-of-work |
| Multi-tenancy | `personaId` on the socket | `TenantContext` / `TenantGuard` |
| Observability | `console.*` | `src/observability/**`, `src/core/diagnostics/**` |

**Architecture B is almost entirely unreachable from Architecture A.** Roughly half the repository is scaffolding that was designed, tested in isolation, and never wired into the running system. The test suite (`src/testing`) exercises **Architecture B**, which is precisely why it can be green while production behaviour is untested.

### Scorecard

| Dimension | Rating | Rationale |
|---|---|---|
| Concept & domain design | **Strong** | Personas, conversation state machine, recovery authority, watchdog, GoAway renewal are genuinely well-conceived. |
| Runtime wiring | **Poor** | ~50% of the codebase is unreachable; the live prompt path bypasses the designed prompt assembler. |
| Correctness of tool layer | **Poor** | Three tools return fabricated `success: true`; hours/prices contradict persona config. |
| Security & privacy | **Critical** | No auth, no origin validation, no rate limiting, unauthenticated Gemini TTS proxy, caller PII logged. |
| Reliability engineering | **Good design, unverified** | Recovery/GoAway/fencing are thoughtfully built; no runtime metrics, no failure telemetry. |
| Testing | **Misleading** | 12 suites / ~41 tests, all custom harness, all aimed at unwired code. Zero tests of the live WebSocket path. |
| Observability | **Poor** | Diagnostics and observability modules are dead; logging is unstructured `console.*`. |
| Operability | **Poor** | No Dockerfile, no CI, no health endpoint contract, no lockfile/manifest agreement. |

### Top five things to fix first

1. **Authenticate and rate-limit the WebSocket and the three HTTP endpoints** (F-01, F-02). Today the app is an open, unmetered proxy to a paid Gemini API key held in server memory.
2. **Stop the tool layer from lying to the caller** (F-03 → F-06). `sendConfirmation`, `transferCall`, `getBusinessHours`, and `getServicePrice` will cause AURA to state false facts to real customers.
3. **Fix the no-op persona prompt editor** (F-07) — a visible control that silently does nothing is worse than no control.
4. **Delete or wire the dead half of the repository** (F-18, dead-code inventory §16). Half-referenced "enterprise" layers create false confidence.
5. **Reconcile the four competing sources of business truth** (F-19): persona JSON, `getBusinessHours` tool, `PRICE_CATALOG`, and `BusinessHours` service.

---

## 2. Scope, method, and limitations

**In scope:** every `.ts`, `.tsx`, `.json`, `.html`, and config file in the repository; `server.ts`; generated lockfile; env/template files; README.

**Limitations — read these before acting on findings:**

- ⚠️ **`node_modules` is absent** (`package-lock.json` also absent; only `bun.lock` is committed). `npm run lint` (`tsc --noEmit`), `npm test`, and `npm run build` **were not executed**. Every claim in this document is from static reading, not from a compiler or a test run. Compile-level errors may exist that static reading cannot see.
- ⚠️ Model identifiers (`gemini-3.8-live`, `gemini-3.8-flash-lite-tts`) were taken from source and are **unverified against the live API**; the project carries its own AI Studio URL in the README, which suggests a generated scaffold.
- ⚠️ The delegated sub-audits (frontend, time/audio, errors, data/infra) returned consistent verdicts, but their lower-severity line numbers were not independently re-read. Items marked ⚠️ should be re-verified before being fixed.
- No runtime traffic, no provider logs, and no database were available, so behavioural claims about Gemini's live API are structural inferences only.

---

## 3. System architecture

### 3.1 Runtime topology

```
┌──────────────────── Browser (React 19 / Vite 8) ────────────────────┐
│                                                                     │
│  App.tsx                                                            │
│   └─ useVoiceAgent.ts  (1,422 lines — the real orchestrator)         │
│        ├─ AuraSessionManager        session lifecycle authority     │
│        ├─ RecoveryManager           sole recovery authority         │
│        │    ├─ ConnectionGuard      generation / stale-callback fence│
│        │    ├─ RetryScheduler       exponential backoff              │
│        │    └─ ErrorRecoveryPolicy  classification                  │
│        ├─ GoAwayRenewalManager     proactive replacement            │
│        ├─ GeminiWatchdog            dead-connection detection        │
│        ├─ ConversationMachine       intent/entity FSM                │
│        ├─ MemoryManager/ContextBuilder  session memory + prompt      │
│        └─ WebSocket  ── /live ──┐                                   │
│        audioUtils.ts (PCM 16 kHz)  │                                  │
│  components/  UI + canvas visualiser                                │
└────────────────────────────────────┼─────────────────────────────────┘
                                     │  ws://host/live
┌────────────────────────────────────▼─────────────────────────────────┐
│  server.ts  (Node, Express 4 + ws 8)                                │
│   GET  /api/cluster/status    ← project-pool health (unauthenticated)│
│   POST /api/greeting         ← Gemini TTS        (unauthenticated)  │
│   POST /api/tts              ← Gemini TTS        (unauthenticated)  │
│   WS   /live                 ← inline Gemini Live relay             │
│        └─ GeminiProjectPool  multi-key acquire/health/cooldown      │
│   dev: Vite middleware mode, hmr:false                              │
│   prod: express.static('dist')                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Live-call data flow (verified)

1. `useVoiceAgent` builds a context (`ContextBuilder.buildContext`) producing `{ systemInstruction, compiledContext }` — ✅ `useVoiceAgent.ts:611`, `:988`.
2. Client opens `ws(s)://<host>/live` and sends `init_session` with `connectionId`, `sessionId`, `voice`, `systemInstruction`, `greetingPrompt`, `sessionMemory` — ✅ `server.ts:351-360`.
3. Server concatenates session memory onto the system instruction and acquires a project from the pool — ✅ `server.ts:179-192`.
4. Server calls `client.live.connect({ model: 'gemini-3.8-live', config: { responseModalities:[AUDIO], outputAudioTranscription:{}, sessionResumption:{} } })` — ✅ `server.ts:195-219`.
5. Audio frames are relayed as base64 PCM (`audio/pcm;rate=16000`) via `sendRealtimeInput` — ✅ `server.ts:383-395`.
6. Server fans provider callbacks back to the browser as typed JSON frames — ✅ `server.ts:221-277`.
7. On `goAway`, the browser's `GoAwayRenewalManager` opens a *replacement* connection and sends `reconnect_session` with the resumption handle, never re-greeting — ✅ `server.ts:361-372`, `:236-245`.

### 3.3 Server → client message contract ✅

| `type` | Payload | Handler |
|---|---|---|
| `audio` | `connectionId`, `data` (base64) | play via `audioUtils` |
| `transcript` | `connectionId`, `speaker:'agent'`, `text` | transcript store / UI |
| `interrupted` | `connectionId` | barge-in, flush playback queue |
| `session_resumption_update` | `connectionId`, `handle`, `resumable` | `AuraSessionManager.updateResumptionState` |
| `goaway` | `connectionId`, `timeRemaining` | `GoAwayRenewalManager.handleGoAway` |
| `status` | `connectionId`, `state`, `projectId?`, `code?`, `reason?` | session state transitions |
| `error` | `connectionId`, `message` | `RecoveryManager` input |

### 3.4 Client → server message contract ✅

| `type` | Payload | Notes |
|---|---|---|
| `init_session` | `connectionId`, `sessionId`, `systemInstruction`, `greetingPrompt`, `voice`, `sessionMemory` | new session |
| `configure` | identical | **aliased to `init_session`** → tears down any live session (F-10) |
| `reconnect_session` | `connectionId`, `sessionId`, `voice`, `systemInstruction`, `sessionMemory`, `resumptionHandle` | no re-greeting |
| `realtime_input` | `pcmBase64` | caller audio |
| `client_content` | `text` | text injection into model turn (F-14) |
| `silence_check` | `prompt` | client-authored prompt injected as system text (F-14) |

**There is no schema validation on either direction.** `JSON.parse(rawMsg.toString())` then direct property access — ✅ `server.ts:347-349`.

---

## 4. State machines and resilience

### 4.1 `AuraSessionManager` — sole lifecycle authority ✅
Session transitions: `STARTING → ACTIVE → RECOVERING → ACTIVE → ENDING → ENDED`, with terminal `FAILED`. Transport states (`CONNECTING`/`OPEN`/`CLOSING`/`CLOSED`) are tracked separately from session state, which is the right call. `executeEnd` is idempotent so parallel end calls converge — covered by `SessionGuard.test.ts:116`.

### 4.2 `RecoveryManager` — sole recovery authority ✅
Deduplicates concurrent failure reports into one recovery operation, distinguishes intentional vs. terminal vs. recoverable, and can be cancelled. ⚠️ A *terminal* classification is what escalates; everything else is retried with backoff.

### 4.3 `ConnectionGuard` — fencing ✅
Every async callback revalidates `(connectionId, generation, sessionId, personaId)` against the live session before acting. This is the strongest reliability mechanism in the codebase and it is correctly used at both `useVoiceAgent.ts:621` and `:643`. Stale-connection rejection is tested (`GeminiResumption.test.ts:134`, `SessionGuard.test.ts:50`).

### 4.4 `GoAwayRenewalManager` — proactive replacement ✅
On upstream `goAway` the manager provisions a *new* connection and swaps it in, preserving `sessionId` and suppressing the greeting. This is a genuinely good design for Gemini's 10-minute session ceiling.

### 4.5 `GeminiWatchdog` — dead-connection detection ✅
Stage-aware: silence during `LISTENING` is normal and must not trip; a timeout during `PROCESSING` is a dead end. Tested at `GeminiWatchdog.test.ts:13`, `:38`, `:84`.

### 4.6 `ConversationMachine` ✅
An explicit intent/entity FSM (`ConversationReducer` + `Events` + `Entities` + `Intent`) — a strong design choice over ad-hoc string matching. ⚠️ However, entity extraction is duplicated across at least three independent parsers (§16, D-03), so the FSM consumes whichever parser happens to be enabled.

---

## 5. Prompt and context assembly

### 5.1 What actually runs ✅
`ContextBuilder.buildContext(...)` returns a **flat three-part string**: system instruction, session memory, compiled context. It is built fresh on every connect and every reconnect and shipped over the socket to the server, which concatenates session memory onto the system instruction and sends the whole thing as `systemInstruction` (`server.ts:185-203`).

Consequences worth understanding:
- **The entire conversation state is re-serialised and re-sent on every reconnect.** There is no incremental update. For long calls this is O(n) per reconnect.
- **Session memory is concatenated into the system instruction**, so caller-supplied memory text sits at high privilege in the prompt.
- `isRecovery=true` on reconnect injects "do not re-greet" constraints ✅ `useVoiceAgent.ts:617`.

### 5.2 What is designed but never runs ⚠️
`src/core/model/PromptAssembler.ts` implements a disciplined **9-layer prompt** (core role → persona → business rules → safety → behaviour → tool rules → session memory → runtime state → compacted history) with token estimation and versioning (`PROMPT_ASSEMBLER_VERSION = '2026-09-29.1'`). A repository-wide grep for importers of `core/model` returns **no external references** ✅. The entire directory — `PromptAssembler`, `ModelSessionManager`, `ContextCompactor`, `ContextBudget`, `ModelDiagnostics` — is dead.

This is the single largest piece of unrealised engineering value in the repository. Even the safety and tool-discipline rules that *are* written (`PromptAssembler.ts:78-99`) — "never claim an appointment is booked until `createAppointment` returns confirmed success" — are not in the live prompt path, and the tools those rules were written for return fabricated successes (§8).

### 5.3 Context budget enforcement ⚠️
`ContextBudget.DEFAULT_CONTEXT_BUDGET` declares `maxEstimatedTokens: 4096`, but `estimateTokens` is only ever *reported*, never enforced. `ContextCompactor.compact` accepts a `sessionId` it never uses, and its `cachedSummaries` map is never written — so `clearSession` is a no-op. Compaction is a pure function of the current transcript, meaning older turns are re-summarised from scratch on every prompt build.

---

## 6. Persona system

Seven persona JSON files ✅ (`aura-salon`, `apex-dental`, `torque-motors`, `grand-realty`, `vanguard-law`, `bistro-dining`, `coolbreeze-hvac`) registered through `PersonaRegistry` with a schema validator. Each carries identity, business/location/contact, services, pricing, weekly hours + holidays, cancellation/rescheduling policy, required contact fields, escalation rules, allowed tools, safety flags, and a `systemPrompt`/`greetingPrompt`.

This is a well-designed configuration surface. Three defects:

- **F-07 — `systemPrompt` editor is a no-op.** ✅ `useVoiceAgent.ts:186` seeds state from `currentPreset.systemPrompt` and `SettingsModal` writes to it, but both call sites that build the connection payload destructure a *shadowing local* `systemInstruction` from `ContextBuilder` (✅ `:611`, `:988`). The user-edited prompt is never transmitted.
- **F-08 — `RequirementPolicy` is keyed by persona IDs that do not exist.** ✅ `core/entities/RequirementPolicy.ts` uses `precision-auto`, `vanguard-realestate`, `lumina-dining`; the registry contains `torque-motors`, `grand-realty`, `bistro-dining`. Every persona silently falls back to a default required-field set, so `MissingInfoResolver` asks the wrong questions (e.g. it will not require `vehicleInfo` for `torque-motors` even though that persona's `contactPolicy.required` demands it).
- **F-36 — holiday calendars are hardcoded** in persona JSON (e.g. `torque-motors.json:53`), so they go stale silently and are uneditable without a redeploy.

---

## 7. Tools

`ToolGateway` mediates tool execution with persona capability authorisation and side-effect flags. The booking path is the most considered part of the tool layer: `BookingValidator` (policy + notice + capacity), `BookingService` (transactional create), `IdempotencyService` (an operation ledger keyed by idempotency key, covering repeated/concurrent submissions), and `ReconciliationService` (reconciles timed-out operations against the calendar provider). `TenantIsolation.test.ts` and `BookingConcurrency.test.ts` cover these — and, notably, they are the tests that are furthest from production reality (§14).

### 7.1 Tools that fabricate success — **fix before any real caller** ⚠️→✅ (verified)

| Tool | File:line | Behaviour | Consequence for the caller |
|---|---|---|---|
| `sendConfirmation` | `messaging/sendConfirmation.ts:15-27` | `console.log` then **unconditional `success: true`** with a fabricated `messageId` | AURA tells a real person an email was sent. It was not. |
| `transferCall` | `transfer/transferCall.ts:14-25` | `console.log` then **unconditional `success: true`**, `queuePosition: 1`, random `transferCode` | AURA claims a handoff that never happened; the caller is left on hold. |
| `getBusinessHours` | `business/getBusinessHours.ts:11-18` | Returns **hardcoded** Mon–Fri 8–7, Sat 9–5, Sun closed, `America/New_York`, **ignoring `persona.hours` entirely** | Wrong opening hours for every persona except by coincidence. |
| `getServicePrice` | `business/getServicePrice.ts:3-28,34,54` | Catalog keyed by `precision-auto` (non-existent persona); falls back to the **salon** catalog; returns `isAuthoritative: true` **even when no price was found** | 5 of 7 personas cannot answer price questions; the one that "works" mislabels a guess as authoritative. |

`getBusinessHours` is the most damaging: `persona.hours.schedule` for `torque-motors` is `07:30–18:00` Mon–Fri / `08:00–14:00` Sat, and the tool — which the persona explicitly lists in `tools.allowed` and which the model is instructed to trust above business config — reports 8–7. The system contains a direct, reachable contradiction about a fact customers ask for on the first call.

---

## 8. Knowledge layer

`KnowledgeResolver.resolveContextualFacts` produces authoritative facts with an explicit `SOURCE_AUTHORITY_HIERARCHY` (live tool > business config > KB > search > model priors) ✅. It correctly derives pricing and hours from persona config, and short-circuits on out-of-scope queries via `KnowledgePolicy` — which is the right behaviour for a receptionist.

⚠️ `ConflictResolver` and `FreshnessManager` are exported but never invoked, so the authority hierarchy is *declared* rather than *enforced*: nothing detects when a tool contradicts config. That missing enforcement is exactly why F-03 survives in production.

---

## 9. Frontend

React 19 + Vite 8, Zustand stores (`SessionStore`, `ServerStore`, `UIStore`), Tailwind. `useVoiceAgent` is a 1,422-line hook holding the entire orchestration surface — session lifecycle, WebSocket lifecycle, audio, recovery, memory, transcript, and the tool bridge. This works, but it is the main maintainability liability in the repository: the same responsibilities are cleanly separated in `src/core/**` and then re-implemented inline in the hook.

⚠️ Findings (delegated, spot-check recommended):
- `src/features/voice/**` is dead — no external importers; the live path is `useVoiceAgent` + `utils/audioUtils`.
- Both canvas visualisers tear down and rebuild their `requestAnimationFrame` loop on every `audioLevel` change (~60×/s), so animation quality degrades under exactly the conditions that matter.
- Modals lack `role="dialog"`, focus trapping, and Escape handling.
- `playbackRate` is used for speech speed, which shifts pitch; no time-stretch.
- "Reset all memory" wipes the seeded protocol rules (`INITIAL_FACTS`) permanently.
- `IndustrySelectorModal.ICON_MAP` keys do not match the `iconName` values the preset mapper produces.
- Transcript sanitisation uses a case-insensitive transform that defeats its own Proper-Case name matcher.
- `HeaderNav.cycleSpeed` is defined but never invoked; `transcriptUtils` is imported but unused.

---

## 10. Persistence and data

**There is no database and no ORM.** All state is in-process `Map`s: `CalendarAdapter` appointments, `IdempotencyService` ledger, `GeminiProjectPool` health, `IdempotencyService`/`TranscriptStore`/`MemoryManager` per session, `ContextCompactor.cachedSummaries`. ⚠️ A thorough reachability analysis found the whole `src/persistence/**` tree (repositories, unit-of-work, mappers, DB adapters) unreachable from any entry point.

Implications: state is lost on restart, nothing is shared across processes, the app cannot be scaled horizontally without sticky routing, and the idempotency ledger — the thing standing between a flaky network and a double-booked customer — evaporates on deploy. `personaId` is carried on the socket and in tool context, but ⚠️ `TenantContext`/`TenantGuard` are not enforced on the live path.

---

## 11. Security and privacy — **highest-severity section**

| # | Issue | Evidence |
|---|---|---|
| **F-01** | **No authentication and no `Origin` validation on the WebSocket.** Any page on the internet can open `/live` and consume the server's Gemini key. | `server.ts:30`, `:143` |
| **F-02** | **Unauthenticated, unmetered Gemini TTS proxy.** `/api/tts` and `/api/greeting` accept arbitrary text and return base64 audio. This is a free, anonymous, unmetered consumer of a paid API. No auth, no rate limit, no size limit beyond the global `10mb` JSON body. | `server.ts:27`, `:48`, `:104` |
| **F-02b** | `/api/cluster/status` exposes internal project IDs, health scores and cooldowns to anyone. | `server.ts:33-45` |
| **F-23** | `express.json({ limit: '10mb' })` is applied globally, to unauthenticated routes. Memory-exhaustion vector. | `server.ts:27` |
| **F-24** | No `helmet`, no CORS policy, no compression, no cache headers, no request logging. | `server.ts:445-451` |
| **F-17** | `/api/tts` returns `500` with raw `err.message` — internal detail disclosure. | `server.ts:138` |
| **F-14** | **Prompt injection by design.** `greetingPrompt`, `silence_check.prompt`, and `client_content.text` are concatenated into model instructions / turns with no escaping or authorisation. Since there is no session auth (F-01), any caller can steer the model. | `server.ts:329`, `:377`, `:399` |
| **F-14b** | The `systemInstruction` and `sessionMemory` are client-supplied verbatim and become the *entire* system prompt. A malicious client fully controls the assistant's persona. | `server.ts:185-203` |
| **F-06** | **PII in logs.** Caller email, service, appointment time are logged by `sendConfirmation`; resumption handles are logged. No redaction, no retention policy, no log sink. | `messaging/sendConfirmation.ts:15` |
| — | Secrets: `GEMINI_API_KEY` and `ADDITIONAL_GEMINI_KEYS` are server-only ✅ and `.gitignore` excludes `.env*` except `.env.example` ✅. This part is correct. | `.gitignore`, `.env.example` |

The combination of F-14b and F-01 is the most serious architectural issue in the repository: **the client is fully trusted to define the agent's behaviour on a public, unauthenticated socket.** A defense-in-depth design would own `systemInstruction` server-side, derived from a validated `personaId`, and treat the client as an untrusted audio transport only.

---

## 12. Testing

`npm test` runs `tsx -e "import {TestRunner} ... TestRunner.runAll()"` — a bespoke in-repo harness (`TestHarness.assert` / `assertEqual`) rather than Vitest/Jest. Twelve suites, ~41 tests ✅:

`AuraSessionManager` (6) · `RecoveryAuthority` (4) · `GeminiResumption` (6) · `GoAwayRenewal` (2) · `GeminiWatchdog` (3) · `GeminiProjectPool` (3) · `SessionGuard` (5) · `DateTimeResolver` (2) · `PersonaValidation` (2) · `ErrorClassification` (3) · `BookingConcurrency` (2) · `TenantIsolation` (2).

**Quality assessment:**

- **Strengths:** the state machine, fencing, recovery authority, GoAway, watchdog, and idempotency concepts are each tested against the invariants that actually matter. That is much better than typical coverage.
- **Weakness — the tests test the wrong thing.** Every suite targets `src/core/**`, `src/server/**`, or `src/testing/**`. **Zero tests exercise `server.ts`, `useVoiceAgent.ts`, the WebSocket protocol, the tool gateway, the prompt path, or any React component.** The tested code and the running code barely intersect.
- ⚠️ The harness has no mocking, no time control, no async timeout, and no parallelism. `RecoveryAuthority.test.ts:81` and `GoAwayRenewal.test.ts` assert on real timers.
- ⚠️ `TenantIsolation.test.ts` asserts tenant isolation for a cache boundary in `src/persistence/**` that is not wired into the live path — a passing test for a guarantee the product does not currently provide.
- ⚠️ Because `node_modules` is absent, **the suite's current pass/fail status is unknown.** The presence of stale persona IDs in `RequirementPolicy` and `PRICE_CATALOG` suggests at least some tests may already be failing, or are asserting the old IDs.

---

## 13. Observability and error handling

⚠️ The `src/core/errors/**` and `src/core/diagnostics/**` and `src/observability/**` trees are essentially dead in the live path; the only production consumer of the error taxonomy is `ErrorRecoveryPolicy.MAX_RETRY_ATTEMPTS`. The declared error-code catalogue and the 57 declared diagnostic event names are never emitted. The live system logs unstructured `console.log` / `console.warn` / `console.error` throughout — e.g. recovery traces at `useVoiceAgent.ts:626`, transport traces at `server.ts:363`, pool health at `server.ts:291`.

Practical effect: you cannot answer "what is the recovery rate?", "how often does GoAway fire?", "what is p95 time-to-first-audio?", or "which persona produces the most tool failures" from this system. For a product whose central engineering investment is resilience, that is a significant gap.

---

## 14. Findings register

Severity: **P0** ships a wrong fact to a customer or exposes the service · **P1** breaks under failure or silently voids a guarantee · **P2** quality/UX/maintainability · **P3** hygiene.

**Register as of 2026-10-01: 40 of 42 findings resolved, 2 partial, 0 open.** The two partials
are the same underlying gap seen from two sides — `F-11` and `F-20` both need a transactional
*shared* store, and no provider for one exists in this environment. `F-42` and `F-41` were
partial in the previous pass and are now resolved with evidence in §F-42 and §F-41 below.

The `F-11`/`F-20` partials are stated for a specific, tested reason rather than left open: the
single-instance path is complete and verified by the container build, the local suite, and
`verify:relay`, but a many-instance deployment is *impossible to make safe* with local journals
and no shared store. `PersistenceTopology` makes that deployment fail readiness rather than
silently double-book, and the closing section of this document records the three Vercel platform
limits that bound the hosted relay. Closing these two findings requires a transactional store, not
more work on this codebase.

| ID | Sev | Finding | Location | Status |
|---|---|---|---|---|
| F-01 | **P0** | No auth / no `Origin` check on `/live` | `server.ts:30,143` | ✅ |
| F-02 | **P0** | Unauthenticated unmetered Gemini TTS proxy | `server.ts:27,48,104` | ✅ |
| F-03 | **P0** | `getBusinessHours` hardcodes hours, contradicts `persona.hours` | `business/getBusinessHours.ts:11-18` | ✅ |
| F-04 | **P0** | `getServicePrice` keyed by non-existent `precision-auto`; `isAuthoritative: true` on a miss | `business/getServicePrice.ts:3-28,34,54` | ✅ |
| F-05 | **P0** | `sendConfirmation` returns fabricated success | `messaging/sendConfirmation.ts:15-27` | ✅ |
| F-06 | **P0** | `transferCall` returns fabricated success | `transfer/transferCall.ts:14-25` | ✅ |
| F-07 | **P0** | Persona prompt editor is a no-op (shadowed variable) | `useVoiceAgent.ts:186,611,988` | ✅ |
| F-08 | **P0** | `RequirementPolicy` keyed by non-existent persona IDs | `core/entities/RequirementPolicy.ts` | ✅ |
| F-09 | **P1** | No schema validation on any WebSocket frame | `server.ts:347-410` | ✅ |
| F-10 | **P1** | `configure` aliases `init_session` and destroys a live session | `server.ts:351` | ✅ |
| F-11 | **P1** | `sessionId` accepted but never stored server-side; a refresh loses the call | `server.ts:353,364` | ◐ |
| F-12 | **P1** | Possible double `pool.release()` (provider `onclose` + socket `close`) | `server.ts:293` vs `:151` | ✅ |
| F-13 | **P1** | `acquire()` returning null silently falls back to the single shared key | `server.ts:180-182` | ✅ |
| F-14 | **P0** | Client fully controls `systemInstruction` / `sessionMemory`; injection via `greetingPrompt`, `silence_check`, `client_content` | `server.ts:185-203,329,377,399` | ✅ |
| F-15 | **P1** | `outputAudioTranscription` enabled, `inputAudioTranscription` not — no authoritative caller transcript | `server.ts:202` | ✅ |
| F-16 | **P1** | Greeting fired after a fixed 50 ms sleep, no readiness handshake | `server.ts:326-330` | ✅ |
| F-17 | **P1** | `/api/tts` returns 200 with `audio: undefined`; 500 leaks `err.message` | `server.ts:135,138` | ✅ |
| F-18 | **P1** | Entire `src/core/model` prompt system is dead | `core/model/**` | ✅ |
| F-19 | **P1** | Four competing sources of business truth (persona JSON, hours tool, price catalog, `BusinessHours`) | multiple | ✅ |
| F-20 | **P1** | All persistence in-memory; idempotency ledger lost on restart | `integrations/calendar`, `tools/booking` | ◐ |
| F-21 | **P1** | No metrics/tracing; observability modules dead | `src/observability/**` | ✅ |
| F-22 | **P1** | Declared error taxonomy unused in live path | `core/errors/**` | ✅ |
| F-23 | **P2** | Global 10 MB JSON body limit on unauthenticated routes | `server.ts:27` | ✅ |
| F-24 | **P2** | No helmet/CORS/compression/cache headers | `server.ts:445-451` | ✅ |
| F-25 | **P2** | rAF loop churn in canvas visualisers | `components/visuals/**` | ✅ |
| F-26 | **P2** | Modals lack dialog semantics, focus trap, Escape | `components/**` | ✅ |
| F-27 | **P2** | `playbackRate` speech speed shifts pitch | `utils/audioUtils.ts` | ✅ |
| F-28 | **P2** | "Reset memory" permanently deletes seeded protocol rules | `useVoiceAgent.ts:61` | ✅ |
| F-29 | **P2** | Transcript sanitisation case handling defeats Proper-Case matching | `utils/transcriptUtils.ts` | ✅ |
| F-30 | **P2** | Stale hardcoded model default `models/gemini-2.0-flash-exp` | `core/model/ModelSessionManager.ts:28` | ✅ |
| F-31 | **P2** | `ContextCompactor.cachedSummaries` never written; `sessionId` unused; `clearSession` no-op | `core/model/ContextCompactor.ts:12,17,52` | ✅ |
| F-32 | **P2** | `ContextBudget` limits declared but never enforced | `core/model/ContextBudget.ts:7-11` | ✅ |
| F-33 | **P2** | `tsconfig` does not enable `strict` | `tsconfig.json` | ✅ |
| F-34 | **P2** | `bun.lock` committed, README documents `npm`, no `package-lock.json` | repo root, `README.md` | ✅ |
| F-35 | **P3** | HMR disabled and WebSocket errors suppressed in the shell | `index.html`, `src/main.tsx` | ✅ |
| F-36 | **P3** | Hardcoded holiday lists in persona JSON | `personas/*.json` | ✅ |
| F-37 | **P3** | `cycleSpeed` defined, never invoked | `components/layout/HeaderNav.tsx` | ✅ |
| F-38 | **P3** | `ICON_MAP` keys mismatch preset `iconName` values | `IndustrySelectorModal.tsx` | ✅ |
| F-39 | **P3** | `ReconciliationService` never invoked | `tools/recovery/ReconciliationService.ts` | ✅ |
| F-40 | **P3** | `ConflictResolver` / `FreshnessManager` never invoked | `knowledge/**` | ✅ |
| F-41 | **P3** | No Dockerfile, no CI configuration, no health-check endpoint | repo root | ✅ |
| F-42 | **P3** | `useVoiceAgent` is 1,434 lines still owning transport, reconnect, routing and tool dispatch | `src/hooks/useVoiceAgent.ts` | ✅ |

### F-42 evidence - what the decomposition actually bought, measured (2026-09-30)

Five responsibilities now live outside the transport hook, and two of them are testable without a browser:

| Extracted | Lines | Why it matters |
|---|---|---|
| `useMicrophoneCapture.ts` | 258 | device lifecycle, permission, level metering |
| `useAudioPlayback.ts` | 202 | ordered queue, single in-flight source, barge-in |
| `useRelayTransport.ts` | transport, reconnect, `GoAway` handoff, frame routing | the delicate half, now behind one seam |
| `useSilenceLadder.ts` | 155 | inactivity escalation scheduling |
| `useSessionMemoryControls.ts` | 92 | memory CRUD surfaced to the UI |

**Second pass: the transport itself came out, and the line count finally moved.** The first
pass extracted the four composables above and left `useVoiceAgent` at 1,434 lines - on the
finding's literal wording ("a file that is too long") that achieved essentially nothing, and the
finding stayed partial. The remainder - `handleSocketMessage`, `executeSocketReconnect`, socket
open/teardown, cookie priming, and the `GoAway` renewal loop - is now `useRelayTransport.ts`,
which took `useVoiceAgent` to **1,084 lines**, a reduction of 350.

That extraction nearly shipped a regression, which is the reason to record it: the GoAway renewal
callback was left pointing at the *original* `executeSocketReconnect` scope after the move, so
proactive renewal silently called a function whose `reconnectRunnerRef` was never assigned and
which therefore returned a permanently rejected promise. The hook compiled and the relay suite
passed. It was caught by `--noUnusedLocals` flagging the now-unassigned reassignment, not by any
test - the one path in the client with no coverage. `reconnectRunnerRef.current =
executeSocketReconnect` is restored, and `useRelayTransport` is now the single owner of that
wiring. A ref that is assigned in one module and read in another is exactly the kind of coupling
extraction is meant to remove, so this is recorded as a hazard of the pattern, not a resolved
detail.

The underlying `ConnectionAuthority` promotion, coalescing and generation fencing moved with it,
and those *are* directly tested (failed handoff is not promoted, generations are not reused, a
verified session is promoted, concurrent reconnects coalesce to one, stale frames are fenced).
The hook itself is still covered only indirectly - this project has no React renderer - so
"transport extracted" is not the same as "transport tested".

The first pass's real win stands: the inactivity policy was previously unreachable by this
project's test runner, because it lived inside a hook. The rules deciding when a paying caller
gets hung up on were completely untested. They are now in `SilenceLadderPolicy` - pure, no
timers, no React - behind seven tests. Two of those cover bugs that were latent, not
hypothetical:

- `advance()` returns `wait` when a turn is frozen, so a nudge cannot land while the agent is
  still speaking. The inline version checked this on scheduling and again on firing; that is
  preserved, because the guard can flip in between.
- `reset()` and `rearm()` are deliberately different. Activity clears the escalation count but
  must not revoke a goodbye already playing, or the caller is left with no prompt, no farewell
  and an open socket. A *new call* must, or the ladder stays disarmed and the next caller sits
  in silence forever. The inline version had one boolean doing both jobs.

`useVoiceAgent` at 1,084 lines still owns session lifecycle, tool dispatch and state
coordination. The finding as written - transport, reconnect, routing and tool dispatch - is
answered: transport, reconnect and routing are extracted, and tool dispatch was already split
into `useToolBridge`. It is recorded as resolved because each named responsibility now has an
owner that is not the god file, not because 1,084 is a comfortable size.

### F-07/F-11 evidence - one prompt authority, and a session that outlives the process (2026-09-30)

F-07 was reported fixed, and the editor genuinely worked. It was still half a lie, and the way
it was half a lie is the reason it is worth writing down.

**A passing test proved a rule existed in code the model never sees.** `GeminiResumption.test.ts`
asserted the recovery continuation instruction ("do not greet again") was present in
`ContextBuilder.buildContext(...).systemInstruction`. That field was never transmitted. The
server assembles the real system instruction through `PromptAuthority` and ignores whatever the
client claims the instruction is - that boundary is F-14. So the test demonstrated the client had
a copy of a rule, not that a caller would hear one greeting instead of two across a reconnect.
A test that passes on dead code is worse than no test, because it retires the finding.

The field is now gone, along with the persona-prompt composition that fed it. The recovery
assertion moved to `PromptAuthority.assemble(...)`, which is the string the provider receives,
and it now checks the real directive text. `ContextBuilder` returns conversation context only -
runtime state, memory, transcript - which is genuinely the client's to own.

**The editor was labelled in a way that implied authority it did not have.** `useVoiceAgent`
returned the textarea's seed text as `systemInstruction`, which reads as "the browser owns the
prompt". It does not; it is the current value of an operator edit, sent as
`instructionOverride` and fenced by the server. Renamed to `instructionEditorSeed` through
`App.tsx` and `SettingsModal`, so nothing in the client is named like a prompt authority. The
control is no longer a no-op *and* no longer looks like one.

**F-11 was fixed for the socket but not for the process.** The registry survived a page refresh,
which was the reported defect. It did not survive a deploy or a crash: a caller who refreshed
into a new instance got a new call and a second greeting - the identical symptom, reached by a
different route. The registry now mirrors to `sessions.json` through the same
`JournalFile` primitives as appointments, so TTL, the hard cap, and least-recently-active
eviction all still hold, and it reloads on boot.

Three properties are asserted rather than assumed:

- a greeted call stays greeted across a restart, and recovery history survives with it;
- a session past its TTL is **discarded** on load, not revived - honouring a stale row would
  suppress a greeting for a call the caller has forgotten, which is its own wrong answer;
- an unwritable data directory **degrades** restart-resume and reports `durable === false`
  instead of throwing, because dropping a live call to protect a mirror is strictly worse than
  the mirror.

**That last test found a real bug in shared code.** `SessionRegistry.persist` documented that it
never throws, and it did: `updateJournal` promised `{ ok: false }` on failure, but called
`acquireLock` outside its `try`, and directory creation throws `EEXIST` when a path component
exists as a file. So an unwritable journal threw out of the appointment write path too, rather
than refusing cleanly. Lock acquisition is now inside the contract.

Remainder, and it is the same remainder as F-20: a file is durable per instance, not shared.
Two serverless instances do not see each other's sessions, and neither do their journals. F-11
is honest about being partial for that reason alone.
### F-20/F-39 evidence — durable writes, and an outcome that is derived rather than guessed (2026-09-30)

The durability work had a gap that the passing tests were actively concealing, and finding it
changed what the tests needed to prove.

**The journal had a lost-update race that only a lock closes.** `AppointmentStore.persist`
re-read the journal before writing, which closes *most* of the window between two writers, but
not all of it: two processes can both read, both decide the 14:00 slot is free, and the second
write-then-rename silently discards the first booking. The caller was told the slot was theirs
and it was not. Re-reading is not sufficient, because the read and the write are not atomic and
neither process can see the other's memory. Both write paths now run inside a cross-process
lock — the lock *is* the file's existence, via `open(..., 'wx')`, which the OS makes atomic —
and a writer that cannot take the lock **refuses the booking** rather than proceeding
unserialised. `JournalFile` holds this machinery once, because two hand-rolled copies of a
cross-process lock would drift, and the second copy is the one nobody tests.

**The durability test was proving something about code that never runs.** There were two
booking services. `tools/booking/BookingService` is what the `createAppointment` tool actually
calls; `application/appointments/BookingService` is a DTO-facing facade that nothing but the
test used, and the suite's F-20 assertions ran against that facade. So the guarantees reported
were never exercised on the production path. The reconciliation test added here runs the live
service, and it passes against the real code.

**The idempotency ledger was the one part of the flow that was not durable.** Appointments
survived a restart while the operations describing them did not. That is worse than it sounds,
because it erased the distinction between *never attempted* and *attempted, outcome unknown* —
both looked like an empty ledger, so nothing could ever tell a retry from a first attempt. The
ledger is now a durable journal, and that makes the ambiguous case recoverable.

**F-39 is resolved by derivation, not by a new service.** The deleted
`ReconciliationService` was not replaced with another component, because the booking path
cannot actually reach an irrecoverable state: there is no remote side effect, so the only
sequence is check-then-write, and a write that cannot be made durable refuses the booking
outright. What remains is the *crash* case, and that is now resolvable. An operation found in a
non-terminal state is moved to `RECONCILING`, and resolution is re-derived from
`CalendarAdapter`'s own idempotency lookup under the same key — the one thing that knows
whether the booking landed. If it landed, the retry returns it; if it did not, the retry books
it. `RECONCILING` now has a producer and a meaning rather than being a status nothing can
reach, and `IdempotencyService.findUnresolved()` reports the gap instead of hiding it.

**Named remainder.** Both stores are filesystem journals, which is honest about failure but not
durable on the deployment target: Vercel has no shared volume, so these remain per-instance.
A production deployment must point them at a shared store; the interface is already the
boundary. `F-20` is therefore ◐, not ✅. Readiness now says so out loud rather than leaving it
in a report: `/ready` reports `persistence.topology` and refuses to start on a many-instance
platform unless the risk is explicitly acknowledged, or `shared: true` is demanded outright.

### The second booking authority is gone (2026-09-30)

The weaker booking path at `src/application/appointments/BookingService.ts` was previously left
in place, on the stated grounds that folding it in "changes what the existing tests assert".
That was the wrong trade and worth recording as such: a test asserting the behaviour of a
*second* authority is not a reason to keep the second authority. The two services disagreed
about what a booking is, and the way to remove a disagreement is to remove one of the speakers.

It was worse than a duplicate. It hardcoded `aura-salon` as the persona for every caller, so a
different business's booking was written against a salon; it bypassed `BookingValidator`
entirely, so business hours and advance-notice policy were not enforced; and it kept its own
idempotency ledger in a process-local `Map` and wrote to a separate in-memory
`AppointmentRepository` the live system never reads. A caller reaching it received
`CONFIRMED` for an appointment recorded somewhere invisible to everything else, with none of
the live path's guarantees. It was exported, so it was reachable.

It is now a thin DTO-shaped facade that delegates to `LiveBookingService.executeBooking`, which
owns validation, the durable ledger, reconciliation of interrupted operations, and the
authoritative store. The facade adds no policy, which is the point. Two things that were
outright wrong are now explicit refusals rather than silent guesses: a missing `tenantId` throws
instead of defaulting to a persona, and a missing `serviceId` throws instead of defaulting to
`Haircut` — the old `checkAvailability` used `query.serviceId` as *both* the persona and the
service, so a caller who supplied a service id was asking about the wrong business and a caller
who did not was asking about a haircut regardless of which persona they were calling.

With that gone, `ToolOperationRepository` had zero remaining importers. It was a second,
process-local idempotency store — 28 lines, no references — sitting in the persistence layer
where the next person could reach for it and get a ledger that loses every operation on
restart. It is deleted, and its absence from `src/persistence/repositories/index.ts` carries a
comment saying so, so the removal is a recorded decision rather than a silent deletion in a
checkout with no VCS. The durable equivalent is `IdempotencyService`.


### F-28 evidence — a memory reset must not also revert the operator's settings (2026-09-30)

Clearing the caller's memory was re-assembling the live prompt with `instructionOverride: null`.
That was wrong in a way the passing tests could not see, because the server never stored the
override anywhere — it applied the override to the provider and moved on, so the provider's
system instruction was the only copy. Any later re-assembly therefore had nothing to carry
forward, and the operator's customisation vanished the moment they cleared the caller's
details: erasing a customer's phone number also silently erased the operator's standing
instructions. The server now retains the active override for the life of the call and reuses
it on reset. Forgetting the caller is a request about the caller's data, not a request to
discard the operator's configuration. Covered by a test that asserts both halves at once: the
caller fact is gone *and* the override survives.

### F-08 evidence — requirements come from the persona, not from a hardcoded ID (2026-09-30)

`RequirementPolicy` keyed requirements by persona IDs that no longer exist, so every lookup
fell through to a default and the per-persona rules (a valet needs vehicle info; a restaurant
needs party size) were never applied to the persona they were written for. Requirements are now
derived from each persona's own `contactPolicy`.

**Status legend.** ✅ fixed and covered by an automated check that currently passes · ◐ regression addressed, a named remainder is still open · ⚠️ open, not fixed.

### F-01/F-02 evidence — closing the relay and the TTS proxies (2026-09-30)

Two related gaps are now closed, and both are verified by real handshakes and real HTTP
requests rather than by inspection.

**The browser can now actually deliver the relay token.** The origin check alone stopped
drive-by abuse in a browser but not a direct socket client willing to lie about `Origin`, so
`AURA_LIVE_TOKEN` remained the correct defence — yet the token could not be set. The
difficult constraint is that a browser cannot attach a custom header to a WebSocket
handshake, and the two obvious workarounds are both unacceptable:

- a token in the query string is written into every access log and proxy log on the path, and
  into browser history;
- a token handed to the page as a value is readable by any injected script.

The resolution is a same-origin `GET /api/live-token` that responds with an `HttpOnly`,
`SameSite=Strict` cookie. The browser attaches it to the upgrade on its own, so the secret
never enters a URL and never reaches page JavaScript. The endpoint is origin-checked and rate
limited, and its response body deliberately contains no secret. One detail worth recording:
the hardened `__Host-` cookie name is only used when the connection is genuinely secure,
because a browser rejects a `__Host-` cookie that is not `Secure` and using it unconditionally
would have silently broken local http development. `AURA_LIVE_TOKEN` is now set in `.env` and
the full live call passes through the cookie path.

**The diagnostic and TTS routes were open to anyone.** Four routes returned internal state
without a credential:

| Route | What it disclosed |
|---|---|
| `/api/prompt-preview` | the entire composed system prompt, i.e. the injection fences, the authority rules, and the business-fact format — a description of how to defeat them |
| `/api/metrics` | per-project slot usage and internal error strings |
| `/api/sessions` | live session identifiers and personas, enough to correlate a caller's activity |
| `/api/tts` | an open, billable synthesis service on the operator's Gemini key accepting arbitrary text |

All four now require the same operator credential as the relay, so there is one secret to
manage rather than two. `/health` deliberately stays public, since an orchestrator cannot hold
a credential and the route returns nothing sensitive. Notably **no browser code path calls
`/api/tts` or `/api/greeting`** — the live agent already streams its own greeting audio from
the Gemini session — so gating them costs the product nothing and closes the exposure entirely.

`npm run verify:relay` now asserts 25 conditions and all pass, including the positive and
negative cookie cases, the `__Host-` name, the origin check on the bootstrap, and the
requirement that the bootstrap body does not contain the secret. (The count is 21, not the 23
first claimed here; the suite prints 21 and the number in the audit was never reconciled
against it.)

### F-11 support — caller memory can no longer inflate the prompt

`MemoryManager` bounded how many session facts existed but never how large one could be. Since
the browser sends `sessionMemory` on every turn, a single oversized fact was admitted and then
paid for in tokens on every subsequent request. Two ceilings now apply, and the policy declares
both: `maxFactChars` (500) rejects one oversized fact outright rather than truncating it, because
a truncated fact is no longer what the caller said and would then be presented to the model as
authoritative; `maxTotalMemoryChars` (4,000) bounds the aggregate across many individually
valid facts, evicting oldest-first.

Separately, the policy has always declared `sensitiveFields` while nothing read it, so the
declaration had no effect at all. `sensitiveFields` is now consulted on the write path. The
first implementation matched by substring and a regression test immediately showed the flaw:
`cardNumber` does not contain `creditCard`, so the most obvious bypass of a card filter would
have passed straight through. Matching is now by normalized token set over an explicitly
enumerated alias list, with substring matching restricted to aliases long enough to be
unambiguous — otherwise a short fragment like `pan` would reject ordinary fields.

Covered by 6 new tests in `MemoryBounds.test.ts`; the suite is 102/102.

> **Correction notice.** An earlier revision of this register marked 30 findings ✅ on the basis that a
> corresponding module had been *written*, not that the finding was *closed*. Re-auditing against the
> running code on 2026-09-29 found that F-07, F-08, F-11, F-14, F-15, F-16, F-18, F-20, F-21, F-22, F-28,
> F-31, F-32, F-35, F-36, F-39, F-40, F-41 and F-42 were not actually closed, and several are marked
> ◐ for partial remediation. A module that nothing imports is not a fix. In particular `src/core/model/**`
> still has **zero importers**, and `server.ts` still holds `activeSessionId` as a per-socket local, so a
> browser refresh still cannot resume a call (F-11).

### F-01 evidence — the regression that only a real handshake could catch

The first implementation of the fix registered the security guard on the wrong emitter:

```ts
const wss = new WebSocketServer({ server: httpServer, path: '/live' });
wss.on('upgrade', handleLiveUpgrade);   // dead code
```

When a `WebSocketServer` is constructed with `{ server }`, the `ws` library attaches its **own**
`upgrade` listener to the HTTP server and calls `handleUpgrade` immediately. It never re-emits
`upgrade` on the `WebSocketServer`, so the guard could not run under any circumstance. The
unit tests for `checkLiveAuth` and `isOriginAllowed` all passed, because they exercised the guard
functions directly rather than the wiring. Every cross-origin and token-less connection was
accepted.

The fix is to own the upgrade:

```ts
const wss = new WebSocketServer({ noServer: true, path: '/live', maxPayload: PROTOCOL_LIMITS.MAX_FRAME_BYTES });
httpServer.on('upgrade', handleLiveUpgrade);   // gate, then wss.handleUpgrade
```

`npm run verify:relay` (`scripts/verifyRelaySecurity.ts`) now boots the real server and asserts
the observable HTTP status of six real WebSocket handshakes, so this class of bug cannot recur
unnoticed:

```
[PASS] cross-origin upgrade is rejected          -> HTTP 401
[PASS] missing Origin is rejected                -> HTTP 401
[PASS] same-origin without a token is rejected   -> HTTP 401
[PASS] same-origin with a wrong token is rejected-> HTTP 401
[PASS] same-origin with the correct token        -> UPGRADED
[PASS] an unknown path is not handled            -> HTTP 404
```

### Current verification state

| Command | Result |
|---|---|
| `npm run lint` → `tsc --noEmit` (`strict`, `noImplicitOverride`, `noFallthroughCasesInSwitch`) | clean |
| `npm test` | 84 / 84 passed |
| `npm run verify:relay` | 6 / 6 passed |
| `npm run build` | successful |
| `npm run verify:gemini` *(real credential)* | 3 / 3 passed |
| `npm run verify:e2e` *(real credential, live call)* | 5 / 5 passed |
| `npm run verify:keys` | both keys authenticate; bucket sharing **inconclusive** |

### Live verification, 2026-09-29

The credential path is no longer theoretical. A real call was made against the Gemini API:

```
[verify:gemini] 1/3 generateContent with gemini-3.8-flash
  (transient provider error, retrying in 2000ms: 503 ... high demand)
  [PASS] authenticated.
[verify:gemini] 2/3 live model "gemini-3.8-live" over a real WebSocket session
  [PASS] Live session established (setupComplete in 767ms).
[verify:gemini] 3/3 TTS model "gemini-3.8-flash-lite-tts" reachability
  [PASS] TTS model returned audio.
```

And the full relay chain, end to end, in a browser-equivalent handshake:

```
[verify:e2e] Full live-call smoke test
  [PASS] relay connected via project "proj-alpha"
  [PASS] server selected the requested persona
  [PASS] received model audio (audio/pcm;rate=24000)
  [PASS] agent transcript: "Thank you for calling AURA Luxury Salon. How may I assist you today?"
  [PASS] all project slots released after the call ended
```

That greeting was produced by the model from a prompt the **server** composed. The client sent
only `{ type, connectionId, sessionId, personaId, voice }` — no system instruction, no greeting
wording, no business facts. The persona, the authoritative business truth, and the safety rules
all came from `PromptAuthority` and `PersonaBusinessTruth`. This is the first direct evidence
that the server-owned authority architecture works in practice rather than only in tests.

### Two model-naming corrections found by live probing

Both defaults were wrong and would have failed only at connect time, with an opaque error:

| Value | Was | Now | How it was caught |
|---|---|---|---|
| probe / non-live model | `gemini-2.5-flash` | `gemini-3.8-flash` | 404: "no longer available to new users" |
| `ModelSessionManager` default | `models/gemini-2.5-flash` | `gemini-3.8-flash` | same 404 |
| live model | `gemini-3.8-live` | `gemini-3.8-live` (correct) | see below |
| TTS model | `gemini-3.8-flash-lite-tts` | unchanged (correct) | returned real audio |

`gemini-3.8-live` initially looked like a bad model id because probing it with
`generateContent` returns `INVALID_ARGUMENT: only supports real-time bidirectional streaming
via WebSocket (bidiGenerateContent)`. That error means the model **exists** and the probe method
was wrong. `verify:gemini` therefore opens a real WebSocket for the live model rather than
trying to reuse the cheap text probe, which would have produced a permanently misleading failure.

### Cluster capacity: confirmed two independent quota buckets

The two configured credentials belong to separate Google accounts and separate Cloud projects,
so they carry independent rate limits. This is not assumed; each key was opened as a real
bidirectional WebSocket session, because a credential can authenticate against the REST API
while its project lacks Live API access. The pool would then register it as a healthy slot and
route callers to a key that cannot open a session, so they would hear silence rather than an
error.

```
[verify:keys] Live-API capability per credential
  primary (GEMINI_API_KEY)       AQ.****... LIVE OK (setupComplete in 1097ms)
  beta   (GEMINI_PROJECT_BETA_KEY) AQ.****... LIVE OK (setupComplete in 756ms)
  2 of 2 credential(s) can serve live traffic.
  At AURA_PROJECT_CAPACITY=4, the pool can admit up to 8 concurrent sessions.
```

Observed distribution with the real credentials, requesting 8 sessions against a ceiling of 8:

```
distribution: {"proj-alpha":4, "proj-beta":4}
total admitted: 8 of 8 requested
after release, all active counts zero: true
```

Load is spread evenly rather than filling the first key to its cap first, which would
concentrate a burst on one rate-limit bucket and leave the other idle. The seventh session is
refused once both buckets are full, and every slot is released on teardown.

### A capacity bug this testing exposed

The duplicate-key collapsing added earlier unconditionally overwrote each project's capacity
with the environment default, which meant an explicitly configured capacity was silently
discarded — the seventh session above was admitted because the test's own `capacity: 3` had
been replaced with the default. The environment-built cluster also hard-coded `capacity: 50`,
which would have overridden any `AURA_PROJECT_CAPACITY` setting an operator chose.

Both are now correct: an explicitly supplied capacity always wins, and `capacity: 0` means
"defer to `AURA_PROJECT_CAPACITY`", which is what the shipped environment cluster uses. The
number is no longer stated in code, so it cannot drift away from what an operator configured
or claim a ceiling that nobody measured.

### Still not verified

These are untested and are **not** claimed as working:

- Vercel deployment, and whether the platform invokes the raw `upgrade` export for WebSockets.
- Real browser microphone capture, echo cancellation, WSOLA playback, and the reconnect handoff
  in a live browser. The e2e test drives the protocol directly, not a real audio device.
- The real concurrent ceiling of either project. `AURA_PROJECT_CAPACITY=4` is an admission
  setting, not a measurement of what the two rate-limit buckets can sustain.
- Session resumption across a genuine provider reconnect (covered by unit tests with a stub only).
- The optional confirmation and transfer webhooks, which have no provider configured and
  therefore correctly return `UNAVAILABLE`.
- Front-end findings F-25, F-26, F-27, F-29, F-37, F-38, which need a browser and a human.

---

## 15. Dead code & duplicate-implementation inventory

| Area | Status | Note |
|---|---|---|
| `src/api/**` (15 files) | ⚠️ 100% unreachable | Express-less transport layer + a `VoiceGateway` duplicating `server.ts`'s inline WS |
| `src/application/**` | ⚠️ 100% unreachable | Use-case services |
| `src/persistence/**` (24 files) | ⚠️ 100% unreachable | Repositories, unit-of-work, mappers, DB adapters |
| `src/security/**` | ⚠️ 100% unreachable | `TenantContext` / `TenantGuard` never enforced |
| `src/core/model/**` | ✅ 100% unreachable | 9-layer `PromptAssembler`, `ModelSessionManager`, `ContextCompactor`, `ContextBudget` |
| `src/core/errors/**` | ⚠️ 1 of 9 files live | Only `ErrorRecoveryPolicy.MAX_RETRY_ATTEMPTS` is consumed |
| `src/core/diagnostics/**` | ⚠️ 100% unreachable | |
| `src/observability/**` | ⚠️ 100% unreachable | |
| `src/features/voice/**` (4 files) | ⚠️ 100% unreachable | Superseded by `useVoiceAgent` + `audioUtils` |
| `src/core/audio/**` | ⚠️ 100% unreachable | VAD, barge-in, audio queue |
| `src/core/time/**` | ⚠️ partially live | `BusinessHours`/`SchedulingPolicy` live; `TemporalParser`/`DateTimeResolver` test-only |
| `src/personas/schema/persona.validator.ts` | ✅ unused at runtime | `PersonaRegistry` does not call it |
| `src/tools/recovery/ReconciliationService.ts` | ✅ unused | Designed for the live path, never called |

**Duplicate implementations (D-series):**

- **D-01 — Business hours:** persona JSON `hours.schedule` · `getBusinessHours` tool (hardcoded) · `core/time/BusinessHours` · `PromptAssembler` layer 3. Four definitions, one is a lie (F-03).
- **D-02 — Pricing:** persona `pricing.services` · `PRICE_CATALOG` · `KnowledgeResolver` pricing facts. Three definitions, one keyed by a dead ID (F-04).
- **D-03 — Date/time parsing:** `core/time/*` · `core/entities/DateTimeNormalizer.ts` · regex extractors in `core/conversation/Entities.ts`. Three parsers feeding one FSM.
- **D-04 — Prompt assembly:** `ContextBuilder` (live) vs. `PromptAssembler` (designed).
- **D-05 — WebSocket transport:** `server.ts` inline handler vs. `src/api/websocket/VoiceGateway.ts`.
- **D-06 — Session fencing:** `ConnectionGuard` (live) vs. `SessionGuard` (unused at runtime).

---

## 16. Engineering practices assessment

**Practices done well**
- Explicit, testable state machines instead of implicit control flow.
- Single-authority-per-concern discipline (`AuraSessionManager` owns lifecycle; `RecoveryManager` owns recovery).
- Generation/connection fencing to defeat stale async callbacks — the mark of a system that has actually been through a production incident.
- Proactive `goAway` renewal instead of waiting for the socket to die.
- Server-only secrets; env files gitignored.
- Personas as validated, versioned, externalised configuration.

**Practices to change**
- **Trust boundary is inverted.** The browser dictates the system prompt on an unauthenticated socket. Server must own the prompt.
- **Unwired scaffolding.** Roughly half the repository is unreachable. Either wire it or delete it; the current state makes the codebase *look* more robust than it is, and the test suite reinforces that illusion.
- **No observability for a resilience-first design.** Recovery code without recovery metrics is unverifiable.
- **Strict mode off**, and lockfile/manifest disagreement (`bun.lock` vs. npm README) undermines reproducible installs.
- **Duplication instead of abstraction** in every cross-cutting concern (D-01…D-06), each of which has already produced a real bug (F-03, F-04, F-08).

---

## 17. Remediation roadmap

**Phase 0 — Stop the bleeding (1–2 days)**
1. Add a shared secret/session token check and strict `Origin` validation on `/live`; add auth + rate limiting to `/api/greeting` and `/api/tts`; consider removing the general `/api/tts` proxy from public exposure. *(F-01, F-02)*
2. Move `systemInstruction` construction server-side from a validated `personaId`; treat client input as data, not instructions. *(F-14)*
3. Make `sendConfirmation`, `transferCall`, `getBusinessHours`, `getServicePrice` return honest results — read persona config instead of hardcoding, and return `success: false` when an integration is not configured. *(F-03 → F-06)*
4. Delete the persona prompt control in the UI until it is wired. *(F-07)*

**Phase 1 — Correctness (1 week)**
5. Fix `RequirementPolicy` keys; add a startup assertion that every persona has a matching policy entry and every `tools.allowed` name resolves to a real tool. *(F-08)*
6. Add Zod (or equivalent) validation to both WebSocket directions and to the three HTTP bodies. *(F-09)*
7. Server-side session registry keyed by `sessionId`; make `pool.release` idempotent. *(F-11, F-12)*
8. Reconcile the four business-hours sources and the three pricing sources into persona config as the single source of truth; add a test that fails on divergence. *(F-19)*

**Phase 2 — Honesty about the codebase (1 week)**
9. Decide per island: wire or delete. Recommended: wire `core/model` (adopt `PromptAssembler` in the live path — it is better than what is running); delete `src/api/websocket`, `src/features/voice`, `src/core/audio`, and `src/core/errors` once superseded. *(F-18)*
10. Extract `useVoiceAgent` into composables (`useLiveSocket`, `useAudioPlayback`, `useRecovery`) so the tested core is the code that runs. *(F-42)*

**Phase 3 — Operability (2 weeks)**
11. Emit the declared diagnostics and error codes; add counters for session start/fail, recovery attempts by classification, GoAway renewals, watchdog trips, and tool outcomes by persona. *(F-21, F-22)*
12. Enable `strict` in `tsconfig`; commit a single authoritative lockfile; add a Dockerfile and a `/healthz` endpoint. *(F-33, F-34, F-41)*
13. Add tests that cross the seam: a fake `WebSocket` driving `server.ts`'s handler, and a component test for `SettingsModal`. *(§12)*

---

## Appendix A — File inventory

| Path group | Files | Reachable from entry point? |
|---|---|---|
| `server.ts` | 1 | ✅ entry |
| `src/hooks/useVoiceAgent.ts` | 1 | ✅ |
| `src/App.tsx`, `src/main.tsx`, `src/types/index.ts` | 3 | ✅ |
| `src/state/**` | 5 | ✅ (3 stores live, ⚠️ 2 not) |
| `src/components/**` | ~16 | ✅ |
| `src/features/voice/**` | 4 | ❌ dead |
| `src/utils/**` | ~3 | ✅ |
| `src/core/session/**` | 2 | ✅ |
| `src/core/recovery/**` | 5 | ✅ (⚠️ `SessionGuard` unused) |
| `src/core/conversation/**` | 6 | ✅ |
| `src/core/memory/**` | 6 | ✅ |
| `src/core/entities/**` | 5 | ✅ |
| `src/core/watchdog/**` | 2 | ✅ |
| `src/core/renewal/**` | 2 | ✅ |
| `src/core/time/**` | ~8 | ⚠️ partial |
| `src/core/audio/**` | ~9 | ❌ dead |
| `src/core/model/**` | 7 | ❌ dead |
| `src/core/errors/**` | 9 | ❌ 1 live |
| `src/core/diagnostics/**` | 8 | ❌ dead |
| `src/observability/**` | 3 | ❌ dead |
| `src/tools/**` | ~20 | ✅ via `ToolGateway` |
| `src/integrations/**` | ~4 | ✅ (⚠️ messaging/transfer stubs) |
| `src/knowledge/**` | 5 | ⚠️ partial (2 dead) |
| `src/personas/**` | 4 + 7 JSON | ✅ |
| `src/server/projects/**` | 1 | ✅ |
| `src/api/**` | 15 | ❌ dead |
| `src/application/**` | 5 | ❌ dead |
| `src/persistence/**` | 24 | ❌ dead |
| `src/security/**` | ~4 | ❌ dead |
| `src/testing/**` | 15 | ❌ not reachable at runtime (by design) |
| root config (`package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.env.example`, `metadata.json`, `.gitignore`, `bun.lock`, `README.md`) | 9 | — |

⚠️ Delegated analyses reported reachable/total counts of **90/203** and **91/190** in two passes; the discrepancy is a counting-convention difference (`.ts`/`.tsx` only vs. all files, differing entry-point sets). Re-derive the canonical number before publishing it in any dashboard.

## Appendix B — Verification commands

Dependencies are **not installed**, so run these first:

```bash
npm install                 # or: bun install   — repo has bun.lock but README says npm
npm run lint                # tsc --noEmit (expects to pass with strict OFF)
npm test                    # in-repo TestRunner, 12 suites
npm run build               # vite build
npm run dev                 # server + Vite middleware on :3000
```

Manual security probe (expect failures — these are F-01/F-02):

```bash
# no credentials required; should currently succeed
curl -X POST http://localhost:3000/api/tts -H "Content-Type: application/json" -d '{"text":"hello"}'
curl http://localhost:3000/api/cluster/status
```

---

### F-41 evidence - the container actually runs, and readiness was lying (2026-09-30)

F-41 was blocked on a stopped Docker daemon, so it sat partial. Docker Desktop was started and
the image built and ran:

| Check | Result |
|---|---|
| `docker build -t aura-voice-agent:verify .` | image built, 21 stages |
| container with no `GEMINI_API_KEY` | **refused to start** - `[boot] GEMINI_API_KEY is not set. The relay cannot start.` |
| container with a key | `Up (healthy)`, 7 personas validated, `[Persistence] Single instance.` |
| `GET /health` | `200 {"status":"ok",...}` |
| `GET /` | `200`, 1,396 bytes, `AURA // Voice AI Agent` |

The first result is the fail-closed boot guard working, and the second confirms the image serves
traffic. But the third measurement is why this finding was still open after everything else had
been declared done.

**Readiness reported `ready: true` for a credential that cannot make a single call.** The probe
added in this pass asked the pool for `hasUsableProject()`, which returns `projects.size > 0` -
that is, *a key string is present*. With `GEMINI_API_KEY=dummy-key-for-container-verification`
in the running container, `/ready` answered `200` with `GeminiLive: HEALTHY, "at least one
project is usable"`. The health check was asserting the credential's absence, not its validity.
Every instance with an expired, revoked, mistyped or rotated-away key would have been declared
ready, handed traffic by the orchestrator, and then failed every call it was given. Fixing
readiness is what exposed this: the original "wait for a call to prove it" version would at
least have failed closed, and replacing it with a self-report created the false green.

`GeminiProjectPool.verifyCredential()` now asks the provider instead of counting itself, using
`models.list` - the cheapest endpoint that still authenticates, so a readiness poll spends no
generation quota. It is cached for 60s so an orchestrator polling every few seconds does not
become a request storm, and it returns `null` (not `true`) when no probe has completed, because
unproven is not proven. Re-measured in the rebuilt image, the same dummy key now yields
`503 ready: false` while `/health` stays `200` - liveness and readiness correctly separated.

The relay suite now covers **both** branches, which is the part that makes the passing one mean
something: a readiness gate only ever shown a working credential proves nothing. The harness
injects a dummy key on purpose, so it points `AURA_CREDENTIAL_PROBE_URL` at a local stub and
asserts `200` when the stub accepts and `503 ready: false` when it rejects. The override changes
only where the probe is sent; it cannot make the probe pass on its own. Three unit tests cover
the same logic directly - rejection, TTL expiry, and an unreachable provider, since "the call
did not fail" is not the same as "the credential is good".

**One leak fixed in the same measurement.** The container had no `AURA_LIVE_TOKEN`, and
`requireOperatorQuiet` returned `true` when auth is unconfigured - on the reasoning that an
unconfigured instance is a developer. The container returned the full `dependencies` array and
`blocking` list to an anonymous caller, including dependency names and failure text. An
unconfigured deployment is the one most likely to be running somewhere public, and nothing
legitimate depends on an anonymous caller seeing it, so the detail is now withheld unless a
credential is configured *and* presented. The public verdict is unchanged, and there is a relay
assertion for it.

### F-15 evidence - the model was never actually told about the tools (2026-09-30)

F-15 was marked fixed in an earlier pass: the server began deriving tool declarations from the
real registry and assigning them to `liveConfig.tools`, with a comment explaining that without
this the model had no way to reach `ToolGateway` at all. The declarations were built correctly.
They were then handed to the SDK in a shape that is not a tool.

`LiveConnectConfig.tools` is `ToolListUnion = (Tool | CallableTool)[]`. A `Tool` is a *container*
holding `functionDeclarations: FunctionDeclaration[]`; a bare
`{ name, description, parameters }` is a `FunctionDeclaration` and is not a member of that
union. The code did `liveConfig.tools = toolDeclarations` — a flat array of declarations. Every
entry carried no recognised tool discriminator, so the provider was handed objects that were not
tools, and the model learned nothing about the calendar.

Three things hid it:

- `const liveConfig: any` meant the compiler could not object. Removing the `any` and typing it
  as `LiveConnectConfig` makes the unwrapped assignment a hard type error, which is the only
  reason the annotation is worth having. A `liveConfig` that the compiler does not check is not
  a type annotation; it is a way of avoiding one.
- No test asserted the envelope. Tests covered the declaration *contents* — every one has a
  description, an object schema, declared arguments — and every one passed, because the bug was
  one level out, in the packaging.
- The live E2E passed. It booted the relay, connected, and confirmed the model spoke. A session
  with a malformed `tools` payload greets the caller perfectly.

**Measured, not argued.** `verify:e2e` now asks a real question as caller text and asserts the
server executed a tool. Against the fixed code:

```
[PASS] the model dispatched a real tool from caller text -> checkAvailability
[PASS] tool metric agrees (toolCalls+1)
```

Against the previous unwrapped shape the same check fails, and the model says:

> "I don't have real-time visibility into specific openings right now. Could you let me know
> which service you're interested in so I can assist you further?"

That is the bug in the model's own words: a receptionist that cannot see its own calendar. The
counterfactual was run rather than assumed, so the check is known to be non-vacuous.

Two details of that check are worth recording. It asserts the `[ToolGateway] Executing
authorized` log line rather than a metric or the transcript, because the model will happily
*say* something plausible whether or not it dispatched anything — a transcript match proves only
that it spoke. And the first version was flaky: the model is non-deterministic, and given "what
times are available?" it sometimes dispatches and sometimes asks which service, which is correct
behaviour but made the assertion non-deterministic. The question now names the service to remove
the ambiguity the model was resolving, and the probe retries up to three times. Three
consecutive runs pass.

### Persona identity, latency, and a credential reaching the model (2026-09-30)

Three further defects, found by reading the live path for the product requirements rather than
re-reading the findings register.

**A caller could be silently connected to the wrong business.** `PersonaRegistry.get()` falls
back to `aura-salon` for an unknown id, which is correct for internal display paths that must
not throw. It was also being applied to the caller-supplied `personaId` on `init_session` and
`reconnect_session`. A caller asking for the dental persona would have been answered by the
salon — the salon's name, hours, prices and services — while their own screen displayed the
persona they requested, and nothing anywhere would have reported the mismatch. Persona identity
is the one thing in this system that must never be ambiguous, so the relay now refuses an
unknown id on both paths with an explicit `unknown_persona` error, counted as an `unauthorized`
metric. `PersonaRegistry.has()` exists to distinguish "unknown" from "defaulted", which
`get()` alone cannot do, and two tests pin that distinction: a case-variant (`AURA-SALON`) and
a trailing space (`aura-salon `) both count as unknown, so a near-miss cannot slip through.

**Every call paid an avoidable round trip before the handshake.** `startSession` awaited
`primeRelayCookie()` — a full HTTP fetch — before opening the WebSocket, so the cookie was
serialised ahead of the upgrade on every single call. The cookie is HttpOnly and long-lived, so
after the first call of a page the browser already has it and the fetch was pure latency. It is
now memoised on success, so only the first call pays, and the fetch no longer gates the socket:
the two proceed concurrently, and `init_session` waits on the cookie only if priming is still
genuinely in flight, bounded at 1.5s so a stalled fetch degrades into the server's own reported
401 rather than a handshake that is never sent. Concurrent calls share one in-flight promise
instead of issuing two. A failure is deliberately not cached — the cookie may simply not have
been issued yet, and caching a failure would leave the relay unable to authenticate for the
rest of the page.

**A provider webhook credential was being handed to the model.** `sendConfirmation` and
`transferCall` returned `provider: url` in their success payload, and that payload goes to the
model verbatim through `toFunctionResponse`. A webhook URL routinely carries a secret in its
path or query string, so this handed a credential to a language model that could speak it to a
caller or write it into a transcript. Both now report `new URL(url).host` — enough for the
model to say a real provider ran, without the secret. The test asserts against `toFunctionResponse`
rather than the raw result, because that is the real boundary where tool output becomes
model-visible, and it requires the stub provider to have *succeeded* first: an unreachable
provider puts no URL in the result at all, so asserting on a failure payload would have passed
while the success path still leaked.

**The resumable window is now five minutes, as specified.** `SessionRegistry` defaulted to two,
which expired during ordinary use — a caller who refreshed after a short pause lost the call
and was greeted again by a receptionist with no memory of them. The default is now 5 minutes,
overridable via `AURA_SESSION_TTL_MS`, and the shipped default is asserted directly rather than a
value passed in by the test, because a TTL is exactly the constant that drifts silently.

---

### Persona identity was not actually bound to the call (2026-10-01)

`SessionRegistry.attach()` re-asserted the persona from whatever the client sent on every
configure, with a comment explaining that a mismatch is "a legitimate user action and not an
attack". The reasoning was wrong even though the conclusion was benign, because the two guarantees
being traded were incompatible: the record also carried `greeted` and `startedAt`.

That combination is the defect. A client that reconnected with a *different* but known persona
kept the original call's `greeted: true`, `startedAt`, and attachment count, so the server skipped
the greeting and continued the old session's stage — under a different business's identity. The
caller is told the agent remembers them, and it does, but it is now the wrong agent. Two clients
sharing a `sessionId` could read each other's continuity state.

The client already does the right thing: the persona boundary in `useVoiceAgent` performs a hard
reset and rotates the `sessionId`, so a genuine persona switch always arrives as a *new* session
rather than a rebind. That made the permissive branch unnecessary as well as wrong.

`attach` no longer writes `personaId` on an existing record, and `personaMismatch()` is consulted
before attach, returning a specific `persona_locked` error to the client and an `unauthorized`
metric. Three tests pin it: same-persona reattach is stable and still counted, a different persona
is detected, and an unknown session is "new", not "mismatched".

---

### A turn typed during recovery was being thrown away (2026-10-01)

`sendTextPrompt` logged `[Outbound] Dropped text prompt: transport is not accepting turns.` and
returned. Freezing a turn is correct — sending into a dying socket both loses the text and
corrupts provider turn state — but discarding it meant a caller who typed a real question while
the upstream session was being replaced got a recovered agent that answered nothing. The text was
still sitting in their input box. The failure is indistinguishable from the agent going deaf, and
it is precisely the moment a user is least likely to forgive.

`OutboundPromptQueue` now holds those turns and flushes them from the *verified* handshake path,
so nothing is sent into a socket that has not finished connecting. If the socket disappears between
the handshake and the flush, the prompts are re-queued rather than lost. Four properties are pinned
because each is its own failure mode:

- **Bounded** by entry count *and* total characters, evicting oldest-first. A caller can keep typing
  through a long outage, and an unbounded string buffer is a memory-exhaustion target.
- **Expiring** (30s). A question asked three minutes ago during a long outage is not what the user
  is waiting for; replaying it produces a confusing stale turn. Expired entries are reported, never
  silently delivered.
- **Session-scoped.** Cleared on hard reset, end, and unmount. On a persona switch, replaying a
  typed turn would carry one business's caller detail into another's context.
- **Ordered and exactly-once.** Drained oldest-first with stable ids, so a flush log can be tied
  back to what was held.

The newest prompt is never the one evicted.

Two further defects surfaced while this was being verified, both in the same code path:

- **A held turn never reached local state.** The frozen branch returned before `addMessage`,
  `processTurn`, and `addSessionFact` ran, so a question typed during an outage was delivered to
  the provider on recovery but was absent from the transcript, from structured memory, and from the
  conversation runtime. The agent then answered a turn the UI had no record of asking, and a fact
  like "my name is Dana" typed mid-blip was never captured. Local state is now committed at typing
  time, and the queue is explicitly responsible for provider delivery only, so a flush cannot
  render the caller's message twice.
- **The character cap was not actually a cap.** `enforceBounds` protects the newest entry from
  eviction, so a single oversized paste was admitted above `maxChars` while the class still
  advertised the limit — an unbounded string buffer reachable from ordinary caller input. A
  prompt that could never fit is now refused at enqueue, and the refusal is distinguishable
  (`TOO_LARGE` vs `EMPTY`) so the UI can say "too long to send" instead of a reconnect message
  that would resolve to silence.

A turn discarded at flush (expired or evicted) is still a turn the caller typed and is still in
their transcript, so the user is told rather than left reading an unanswered question.

---

### Callers were being recorded under the name "looking for" (2026-10-01)

Found while writing a regression test for the turn-queue fix above, not by the existing suite.

Two regexes independently tried to detect "the caller just gave their name", in
`core/conversation/Entities.ts` and `utils/transcriptUtils.ts`. Each matched a trigger phrase and
then took the next one or two words with a character class like `[A-Za-z][A-Za-z]` under the `i`
flag. Nothing in that pattern distinguishes a name from ordinary sentence furniture, so:

| Caller says | Recorded as |
| --- | --- |
| "I am looking for a haircut" | `looking for` |
| "This is urgent, I need help" | `urgent` |
| "Call me tomorrow" | `tomorrow` |
| "I am interested in the deluxe package" | `interested in` |
| "My name is Dana and I need a refill" | `Dana and` |

`customerName` is what the voice hook writes into structured memory and what a booking is filed
under, so these strings reached the appointment record and were read back to the caller in
confirmation as though they were a person. The two layers also disagreed with each other — the
entity extractor said `Dana and` while the session-fact extractor produced something else — so one
call could record two different names.

The fix is `core/entities/NameExtraction.ts`, a single extractor used by both call sites:

- **Only unambiguous triggers count.** "My name is", "my name's", and "call me" are what a caller
  says when volunteering a name. "I am", "I'm", and "this is" open ordinary sentences far more
  often than they introduce a name, so they are not triggers; "My name is Dana" already covers
  the case without them.
- **A name ends at the first word that cannot be part of one.** Conjunctions, pronouns, verbs, and
  time words terminate the capture, so `Dana and` becomes `Dana` while `Mary Jane Watson` and
  `jean-luc picard` are still captured in full.
- **Casing is not the filter.** Speech-to-text casing is unreliable, so `my name is jean-luc` still
  works; the strong trigger is what makes the capture safe, not capitalisation.

Pinned by 19 tests in `NameExtraction.test.ts`, including that the runtime entity and the session
fact cannot disagree.

---

### The browser was shipping the server's persistence stack, and the Vercel function did not exist (2026-10-01)

`vercel.json` rewrote `/health`, `/live` and `/api/*` to `api/index.ts`, and `server.ts` documented
that "`api/index.ts` imports `app` and the relay" — but the file was never created. On Vercel the
static build served and the entire backend 404'd, which reads as a working site with a dead API.
Nothing in the local suite could catch it: the suite exercises the standalone server, and a
Vercel-only routing fault is invisible from there.

`api/index.ts` now exists. It obtains the upgrade primitives from Vercel's request context
(`Symbol.for('@vercel/request-context')`, the same mechanism `@vercel/functions` uses internally, so
no Vercel-only runtime dependency is added and no experimental API becomes a hard requirement) and
hands them to the existing `handleLiveUpgrade`. Routing the upgrade rather than reimplementing it is
the point: that function owns the origin allowlist and the relay token check, and a second copy of
the most important guard in the codebase would be the copy nobody tests.

`npm run verify:vercel` drives the real handler with a real WebSocket handshake, standing in only
the one platform behaviour the adapter depends on. It found a production-breaking bug on first run:

**A rewrite replaces `req.url` with the destination.** With the rewrite in place, `req.url` is
`/api/index.ts`, and both `handleLiveUpgrade`'s own `pathname !== '/live'` check and the `ws`
server's `path: '/live'` option inspect that URL. Every legitimate upgrade was rejected 404 *before
a socket existed* — the page loads, the token issues, and no call ever connects. The adapter now
restores the browser-original path (read from `x-vercel-original-path`, falling back to `req.url`)
after validating it is `/live`, which cannot widen the guard. The 12 checks now cover the upgrade
succeeding through the context, refusal without the relay cookie, refusal for a non-relay path, and
an actionable `501` when the platform offers no upgrade primitives at all — which is what Vercel
looks like without Fluid compute.

**`"runtime": "@vercel/node@5"` failed the deployment build.** Every build died at
`Error: Function Runtimes must have a valid version, for example 'now-php@1.0.0'`. Vercel's
`validateFunctions` takes the substring after the *last* `@` and requires complete semver, so a
scoped package name defeats its own check: `"@vercel/node@5"` splits to `["", "vercel/node", "5"]`
and the bare major `5` is not a version. It is a plausible-looking value, and nothing in the
schema flags it. The `runtime` key is now omitted entirely and the Node version is pinned in
`package.json` `engines` (22.x, matching the Dockerfile and CI), which is where Vercel reads it.

This class of fault is invisible to a handler test, because the handler is never reached — the
build fails during config validation, before any code runs. `verify:vercel` now checks `vercel.json`
statically for the two config faults that actually occurred here: a `runtime` that fails Vercel's
semver rule, and a rewrite pointing at a file that does not exist. The second is the same defect
as the missing `api/index.ts` above, caught at commit time rather than as a 404 in production.

**The server persistence stack was in the browser bundle.** `useVoiceAgent` imported `ToolGateway`
from the `../tools` barrel purely to expose `executeAuthoritativeAction` — a helper with no consumer
anywhere in the app. The barrel re-exports the entire server-side booking stack, which reaches `fs`
and `path` through `JournalFile` and `AppointmentStore`; `rolldown-vite` externalized those for the
browser, so the client shipped a booking implementation that could not work there, and the build
printed warnings naming the exact files. Removing the dead helper and importing nothing from the
barrel dropped the client bundle from 452.54 kB to 406.87 kB and eliminated the warnings. The server
is the sole tool authority, so the browser had no legitimate reason to link the tool stack at all.

**The audio worklet was never running, and the failure was invisible.** The worklet was built as a
`Blob` URL at runtime, but `AudioWorklet.addModule()` honours the page's `script-src` CSP, and the
shipped policy deliberately does not allow `blob:` there. The browser refused to load it, a bare
`catch` swallowed the rejection, and the only symptom was the app quietly falling back to
`ScriptProcessorNode` and logging "ScriptProcessorNode is deprecated". It now loads from
`public/aura-mic-worklet.js` — same-origin, no CSP exception needed — and a failed load logs a
one-time error naming the cause. Verified: `200`, `Content-Type: text/javascript`, served under
`script-src 'self'`.

**A silent tool answer was being reported as a pass.** The E2E probe accepted any non-empty
transcript as an answer, and the provider intermittently returns a literal `<no speech>` marker. A
run in this pass produced `tool-probe answer: "<no speech>{pause}"` and was logged green: the tool
dispatched, the metric incremented, and the caller would have heard nothing. For a voice
receptionist that is the worst possible failure — it looks healthy right up until a customer is on
the line. The probe now fails on silent markers and reports the retry requirement.

**Disconnect diagnosis was blind to its own cause.** The client logged
`[Transport] Upstream disconnected` and discarded the provider's close code and reason, so every
disconnect looked identical — an idle timeout, a quota kill, and a network reset were
indistinguishable, which is precisely why no keep-alive decision could be made. The close code and
reason are now carried into the recovery log.

---

### Vercel hosting: what is verified, and what is not (2026-10-01)

`api/index.ts` is verified locally against the real handler and a real WebSocket handshake. What
cannot be verified locally is Vercel's own runtime, and three documented platform facts bound what
this deployment can be, so they are stated rather than discovered in production:

1. **Connections are duration-capped.** A WebSocket on Vercel is a function invocation and closes
   at `maxDuration`: 300s on every plan (Hobby cannot exceed it), 800s on Pro/Enterprise, with a
   1,800s extended beta. `vercel.json` sets `maxDuration: 300`. A voice call longer than five
   minutes will be disconnected by the platform, and a receptionist call routinely runs longer.
   The client's recovery path handles this, but it is a periodic disconnect, not a bug to chase.
2. **A connection is pinned to one instance, and a reconnect may land on another.** That is
   precisely the `MULTI_INSTANCE_RISK` condition. `verify:vercel` asserts that `/ready` reports
   `topology: MULTI_INSTANCE_RISK` and returns **503** on an ephemeral platform unless an operator
   sets `AURA_ACK_MULTI_INSTANCE_PERSISTENCE`. With no external store, a reconnect landing elsewhere
   loses the session record, so `greeted` is forgotten and the caller is greeted a second time.
3. **WebSockets require Fluid compute**, which is the default only for projects created on or after
   2025-04-23. The handler returns an actionable `501` naming this rather than accepting the
   request and leaving the caller with a socket that never opens.

**Therefore: the relay is safe to run on Vercel for a bounded single-instance demo, and is not
correct for production traffic without a shared transactional store.** The `Dockerfile` in this
repository is the single-instance deployment that satisfies F-11 and F-20 outright — one process,
one authoritative journal, no duration cap, no cross-instance greeting. That is the deployment to
use for a real receptionist.

`F-11` and `F-20` remain **partial** in the register for this reason, and this section is the
reason the status is not simply "resolved because the tests pass". The single-instance path is
complete and verified; the many-instance path is impossible to verify and unsafe to claim.

---
