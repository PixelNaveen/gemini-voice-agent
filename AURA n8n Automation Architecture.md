# AURA Voice Agent — n8n Automation Architecture

**Status:** Planning document — Phase 2 (n8n integration), not yet built **Scope:** 7 personas, 1 shared Google Calendar, Zoho SMTP notifications, Oracle Cloud single-VM hosting **Companion to:** core-behavior.md, persona JSON schema v2.0.0, N8nClient.ts contract

---

## 1. System Overview

How a caller's words become a real calendar event, end to end.

```mermaid
flowchart TD
    A[Caller - Voice] --> B[Gemini Live]
    B --> C[Node Backend - server.ts]
    C --> D{Tool Call?}
    D -->|getBusinessHours / getServiceInfo| E[Local Persona JSON Lookup]
    D -->|checkAvailability / createAppointment / etc| F[N8nClientFactory]
    F -->|N8N_MODE=mock| G[MockN8nClient - in-memory]
    F -->|N8N_MODE=live| H[n8n Webhook Gateway]
    H --> I[n8n Workflow Engine]
    I --> J[(Shared Google Calendar)]
    I --> K[Zoho SMTP]
    I --> C
    E --> C
    C --> B
    B --> A

    style H fill:#e8f0fe
    style I fill:#e8f0fe
    style J fill:#fef3e0
    style K fill:#fef3e0
```

**Key invariant:** the Node backend never talks to Google Calendar or Zoho directly. n8n is the only component with those credentials. The app only ever calls n8n's webhook, authenticated by a shared secret header.

---

## 2. Component Responsibility Map

| Component | Owns | Never does |
| --- | --- | --- |
| Gemini Live | Conversation, intent, speech | Dates, prices, calendar truth |
| Node backend (`server.ts` + tools) | Session state, persona truth, tool dispatch, date resolution | Talk to Google/Zoho directly |
| n8n | Calendar reads/writes, email sending, idempotency, booking locks | Conversation logic, persona personality |
| Google Calendar (shared) | Single source of truth for all bookings, all 7 personas | — |
| Zoho SMTP | Transactional email only | — |

---

## 3. The Shared Calendar Data Model

One calendar, `personaId` + `resourceId` carried as **private extended properties** on every event (visible only to the calendar owner — n8n's service account — never to any attendee).

```mermaid
erDiagram
    CALENDAR_EVENT {
        string eventId
        string personaId "REQUIRED on every query"
        string resourceId
        string sessionId
        string requestId
        string confirmationCode
        datetime start
        datetime end
        int partySize "seat-capacity resources only"
        string customerEmail
        string status "confirmed/cancelled"
    }
    PERSONA ||--o{ RESOURCE : has
    RESOURCE ||--o{ CALENDAR_EVENT : "booked via resourceId"
    PERSONA ||--o{ CALENDAR_EVENT : "scoped via personaId"
```

**Hard rule, enforced structurally:** every `events.list` call against this calendar uses Google's `privateExtendedProperty` server-side filter with `personaId=<x>` as a mandatory, non-optional parameter. This lives in one shared sub-workflow (§4, node 02) that every other workflow calls through — it is not re-implemented per workflow, so it cannot be accidentally skipped.

```mermaid
flowchart LR
    Q[Any query against the calendar] --> F{personaId filter present?}
    F -->|No| X[BLOCKED - structurally impossible<br/>query always routes through<br/>02-Availability-Core]
    F -->|Yes| R[privateExtendedProperty filter sent to Google]
    R --> S[Results scoped to one persona only]
```

---

## 4. Workflow Map

```mermaid
flowchart TD
    GW["00 - Webhook Gateway<br/>(auth + request validation)"]

    GW --> BC["01 - Business Config Lookup<br/>(personaId -> hours, resources,<br/>businessType, holidayPolicy)"]

    BC --> AVAIL["02 - Availability Core<br/>(shared sub-workflow)"]

    AVAIL --> BOOK["03 - Booking Engine"]
    AVAIL --> ALT["03b - Find Alternative Times"]
    AVAIL --> RESCH["04 - Reschedule Engine"]

    BOOK --> NOTIFY["07 - Notification Sub-workflow<br/>(Zoho SMTP)"]
    RESCH --> NOTIFY
    CANCEL["05 - Cancellation Engine"] --> NOTIFY

    LOOKUP["06 - Lookup Engine"] --> AVAIL

    RESCH --> VERIFY["Ownership Verification<br/>(4-field match)"]
    CANCEL --> VERIFY

    BOOK --> ERR["08 - Error Handler<br/>(n8n Error Trigger)"]
    RESCH --> ERR
    CANCEL --> ERR
    AVAIL --> ERR
    LOOKUP --> ERR

    ERR -.->|standardized failure shape| GW

    style GW fill:#fde8e8
    style AVAIL fill:#e8f0fe
    style VERIFY fill:#fde8e8
    style ERR fill:#fde8e8
    style NOTIFY fill:#fef3e0
```

Nothing calls Google Calendar directly except `02 - Availability Core`, `03 - Booking Engine`, `04 - Reschedule Engine`, `05 - Cancellation Engine`, and `06 - Lookup Engine` — and all of them route their *reads* through 02 so the `personaId` filter rule in §3 is enforced in exactly one place.

---

## 5. checkAvailability — Full Sequence

```mermaid
sequenceDiagram
    participant App as Node Backend
    participant GW as 00-Gateway
    participant BC as 01-Business Config
    participant AV as 02-Availability Core
    participant GC as Google Calendar

    App->>GW: POST /webhook/checkAvailability<br/>{personaId, serviceId, date, time?, partySize?}
    GW->>GW: verify shared-secret header
    GW->>BC: forward request
    BC->>BC: load persona JSON (businessType,<br/>hours, holidayPolicy, resources)
    BC->>AV: {hours, resources, serviceDuration, businessType}
    AV->>AV: check holiday policy (see §8)
    alt closed day / holiday
        AV-->>App: {available:false, reason:"closed"}
    else open
        AV->>GC: events.list(privateExtendedProperty:<br/>personaId=X, timeMin, timeMax)
        GC-->>AV: matching events
        AV->>AV: filter by resourceId<br/>(appointment type: any free resource)<br/>(reservation type: sum partySize vs capacity)
        AV-->>App: {available, slots:[...], reason?}
    end
```

---

## 6. createAppointment — Full Sequence (the critical path)

This is the workflow where the earlier "false email claim" bug lived — the diagram makes the fix structural, not just a prompt instruction.

```mermaid
sequenceDiagram
    participant App as Node Backend
    participant GW as 00-Gateway
    participant BOOK as 03-Booking Engine
    participant AV as 02-Availability Core
    participant GC as Google Calendar
    participant NOTIFY as 07-Notification
    participant Zoho as Zoho SMTP

    App->>GW: POST /webhook/createAppointment<br/>{personaId, sessionId, requestId, serviceId,<br/>date, start, resourceId, customerName, email}
    GW->>BOOK: forward (auth passed)

    BOOK->>BOOK: input sanity check<br/>(valid email, non-empty name,<br/>partySize in range)
    alt fails sanity check
        BOOK-->>App: {success:false, errorCode:"INVALID_INPUT"}
    end

    BOOK->>GC: search for existing event<br/>with this exact requestId
    alt requestId already booked (idempotent hit)
        GC-->>BOOK: existing event found
        BOOK-->>App: {success:true, confirmationCode:<existing>,<br/>emailStatus:<as originally sent>}
    else new request
        BOOK->>AV: re-check availability RIGHT NOW<br/>(time has passed since app's first check)
        alt slot no longer free
            AV-->>BOOK: unavailable
            BOOK-->>App: {success:false, errorCode:"CONFLICT",<br/>message:"no longer available"}
        else still free
            BOOK->>BOOK: generate confirmation code<br/>(6+ alphanumeric, persona-scoped,<br/>collision-checked)
            BOOK->>GC: events.insert(extendedProperties:<br/>{personaId, resourceId, sessionId,<br/>requestId, confirmationCode})
            GC-->>BOOK: event created
            BOOK->>NOTIFY: send booking confirmation email
            NOTIFY->>Zoho: SMTP send
            alt email sent
                Zoho-->>NOTIFY: 250 OK
                NOTIFY-->>BOOK: emailStatus:"sent"
            else email failed
                Zoho-->>NOTIFY: error
                NOTIFY-->>BOOK: emailStatus:"failed"
            end
            BOOK-->>App: {success:true, confirmationCode,<br/>appointment:{...}, emailStatus}
        end
    end
```

**Why `emailStatus` is on the critical path, not a side note:** the app's `PromptComposer` reads this field to decide whether the agent is *allowed* to say "I've sent a confirmation to your email." If n8n ever returns success without `emailStatus`, the safest default on the app side is to treat it as `"not_configured"` — never assume `"sent"`.

---

## 7. Reschedule / Cancel — Ownership Verification (4-field, fail-closed)

```mermaid
flowchart TD
    Start["Caller requests reschedule/cancel"] --> Ask["Agent asks for:<br/>confirmation code + name + date + time"]
    Ask --> Fetch["n8n: fetch event by confirmationCode<br/>scoped to personaId"]
    Fetch --> Found{Event exists<br/>for this personaId?}
    Found -->|No| Neutral1["Return generic mismatch<br/>(same message as any other failure)"]
    Found -->|Yes| Compare["Compare ALL FOUR fields:<br/>code, name, date, time"]
    Compare --> AllMatch{All four match<br/>exactly?}
    AllMatch -->|Any field off| Neutral2["Return generic mismatch —<br/>NEVER reveal which field failed"]
    AllMatch -->|All match| Proceed["Proceed with reschedule/cancel"]

    Neutral1 --> Count["Increment session attempt counter"]
    Neutral2 --> Count
    Count --> Capped{3rd failed<br/>attempt this call?}
    Capped -->|No| Ask
    Capped -->|Yes| Fallback["Agent: 'I'll give you the<br/>business number so they<br/>can look it up directly.'"]

    style Neutral1 fill:#fde8e8
    style Neutral2 fill:#fde8e8
    style Fallback fill:#fde8e8
```

The "never reveal which field failed" rule is enforced at the n8n level — the workflow returns one shape (`{matched:false}`) regardless of *which* comparison failed, so there's no field in the response for the app or the model to accidentally leak.

---

## 8. Holiday & BusinessType Decision Logic

```mermaid
flowchart TD
    Req["Availability check for date D"] --> HasOverride{"Service has<br/>availableOutsideHours:true?<br/>(e.g. HVAC emergency-repair)"}
    HasOverride -->|Yes| Open["Treat as open —<br/>skip holiday check entirely"]
    HasOverride -->|No| CheckList{"Date D in persona's<br/>explicit holidays[] list?"}
    CheckList -->|"Yes, closed:true"| Closed["Closed"]
    CheckList -->|"Yes, closed:false"| OpenSpecial["Open (special hours if listed)<br/>e.g. bistro on NYE"]
    CheckList -->|Not listed| Policy{"holidayPolicy"}
    Policy -->|federal_subset| Federal["Fall back to FederalHolidays.ts"]
    Policy -->|custom| AssumeOpen["No match in custom list -> open"]
    Policy -->|always_open| AssumeOpen2["Always open (HVAC default)"]
    Federal --> FedCheck{"Is D a federal holiday?"}
    FedCheck -->|Yes| Closed
    FedCheck -->|No| Open
```

| businessType | Capacity model | Typical holidayPolicy | Emergency override |
| --- | --- | --- | --- |
| `appointment` (salon, dental, auto, legal) | 1 resource = 1 booking | `federal_subset` | No |
| `reservation` (bistro) | Sum `partySize` vs. seat capacity | `custom` (closed Christmas/Thanksgiving, open NYE) | No |
| `consultation` (realty) | 1 resource = 1 booking, often complimentary | `custom` (weekends often open) | No |
| `dispatch` (HVAC) | 1 resource = 1 booking + always-on emergency pool | `custom` | Yes — `availableOutsideHours` bypasses holiday check |

The engine never branches on `personaId` by name — only on `businessType` and the declared JSON fields. Adding an 8th persona later is a config change, not a code change.

---

## 9. Concurrency & Locking

Two different personas booking the same clock time must never interfere — and two requests for the *same* persona+resource+slot must never double-book.

```mermaid
sequenceDiagram
    participant Req1 as Request A (aura-salon, Marcus, Fri 2pm)
    participant Req2 as Request B (torque-motors, Bay-1, Fri 2pm)
    participant Lock as n8n Lock Key Store

    Note over Req1,Req2: Same clock time, different personas — must NOT block each other

    Req1->>Lock: acquire("aura-salon:marcus:2026-10-09:14:00")
    Req2->>Lock: acquire("torque-motors:bay-1:2026-10-09:14:00")
    Note over Lock: Different keys -> both proceed in parallel
    Lock-->>Req1: granted
    Lock-->>Req2: granted
```

**Lock key format:** `{personaId}:{resourceId}:{date}:{time}` — never just `{date}:{time}`. This is a one-line implementation detail with an outsized consequence if missed: without `personaId` and `resourceId` in the key, unrelated personas would serialize behind each other during concurrent demo calls.

---

## 10. Spam / Off-Topic Handling (conversational layer)

```mermaid
flowchart TD
    Input["Caller says something"] --> Classify{Intent?}
    Classify -->|Booking-related| Normal["Proceed normally"]
    Classify -->|Off-topic / sales pitch / unrelated| Redirect1["Agent: one short redirect line —<br/>'I'm just set up to help with<br/>scheduling here — for anything else,<br/>you can reach them through the<br/>website or email.'"]
    Redirect1 --> Repeat{Same off-topic<br/>thing again?}
    Repeat -->|Yes| Redirect2["Shorter: 'Same as before —<br/>happy to help if you'd like to book.'"]
    Redirect2 --> Disengage["Stop re-engaging this topic.<br/>Wait for booking intent or call end."]
    Repeat -->|No, new topic| Redirect1

    style Redirect1 fill:#fef3e0
    style Redirect2 fill:#fef3e0
    style Disengage fill:#fef3e0
```

This logic lives entirely in `core-behavior.md` (new §11) — it is identical across all 7 personas and needs no n8n involvement, since it never reaches a tool call.

---

## 11. Abuse Protection (system layer, separate from conversational spam)

```mermaid
flowchart TD
    subgraph Relay["Node Backend / guards.ts"]
        R1["Cap concurrent /live sessions per IP"]
        R2["Cap connection attempts per minute per IP"]
    end
    subgraph N8N["n8n Booking Engine"]
        N1["Reject malformed input<br/>before availability re-check<br/>(bad email, empty name,<br/>partySize out of range)"]
        N2["Velocity check: same email + personaId<br/>creating 5+ bookings in 10 min<br/>-> silently cap, generic error<br/>(never reveal the threshold)"]
    end
    Caller --> Relay --> N8N --> Calendar[(Google Calendar)]
```

---

## 12. Error Response Contract

Every workflow that can fail returns the **same shape**, so the app never has to guess:

```json
{
  "success": false,
  "errorCode": "CONFLICT | INVALID_INPUT | NOT_FOUND | RATE_LIMITED | UPSTREAM_ERROR",
  "message": "human-readable, safe to read aloud or adapt"
}
```

```mermaid
flowchart LR
    Fail["Any node fails<br/>(Calendar API error, timeout,<br/>validation error)"] --> ET["n8n Error Trigger Workflow (08)"]
    ET --> Shape["Normalize into standard<br/>{success:false, errorCode, message}"]
    Shape --> App["App: 'I couldn't confirm that —<br/>let me try again' (never a false success)"]
```

---

## 13. Security Layering

```mermaid
flowchart TD
    Internet["Public Internet"] --> Caddy["Caddy (TLS, Oracle VM)"]
    Caddy -->|"/live, /api/*"| App["Node Backend container"]
    Caddy -->|"/webhook/* only"| N8nEditor{"n8n editor UI"}
    N8nEditor -.->|NEVER exposed publicly| X["blocked"]
    Caddy -->|"/webhook/*"| N8n["n8n container"]
    App -->|"shared-secret header"| N8n
    N8n -->|"OAuth / API key,<br/>stored only in n8n credentials"| GCal[(Google Calendar)]
    N8n -->|"SMTP credentials,<br/>stored only in n8n"| Zoho[(Zoho Mail)]

    style X fill:#fde8e8
```

Both containers (app + n8n) run on the same Oracle Ampere VM, same Docker network — the webhook call never leaves the machine.

---

## 14. Open Items Before Build

These are the only remaining decisions, everything else in this document is locked:

1. **Lock-store implementation** — in-memory inside n8n (simplest, fine for single-VM demo) vs. a tiny Postgres/Redis table if you want locks to survive an n8n restart mid-booking.
2. **Velocity-check storage** — same choice as above; a lightweight key-value store inside n8n is enough for a demo volume.
3. **Confirmation code generation location** — this document assumes n8n generates it (§6), replacing the mock's generator. Confirm that's still correct now that n8n owns the calendar.

Once these three are confirmed, the next document is the literal per-workflow JSON contract (request/response schema, node-by-node) ready to hand to whoever builds the actual n8n workflows.