/**
 * A caller's typed turn must survive the connection that was supposed to carry it.
 *
 * The failure this exists for: the user types a real question, the upstream Gemini session dies
 * mid-call, and the UI is briefly in `RECONNECTING`. The old behaviour was to log
 * `[Outbound] Dropped text prompt: transport is not accepting turns.` and throw the text away.
 * The recovery then succeeded, the transcript showed a reply to nothing, and the user - quite
 * reasonably - concluded the agent had gone deaf. The text was still on screen in their input
 * box, and the whole failure looked like a product bug rather than a transport blip.
 *
 * Freezing a turn is still the right call: sending into a dying socket loses the text *and*
 * corrupts the provider's turn state. So the fix is not "send anyway", it is "hold it, then send
 * it once the socket is actually healthy again".
 *
 * Design constraints:
 *
 * - **Bounded.** An outage can last minutes, and a caller can keep typing. Without a cap this
 *   queue is an unbounded string buffer keyed on nothing. `maxEntries` and `maxChars` both bound
 *   it, and the *oldest* entries are evicted first, because the most recent question is the one
 *   the user still cares about getting answered.
 * - **Expiring.** A question asked three minutes ago during a long outage is no longer what the
 *   user is waiting for; replaying it into a recovered call produces a confusing, stale turn.
 *   Entries older than `ttlMs` are discarded on drain and reported, never silently delivered.
 * - **Session-scoped.** The queue is cleared outright on hard reset, end, and persona switch. A
 *   typed question is bound to the conversation it was typed into; replaying it into a new
 *   persona's session would leak one business's caller detail into another's context.
 * - **Not a transcript.** The caller still sees their text in the transcript as typed. This only
 *   guarantees it reaches the provider.
 */

export interface QueuedPrompt {
  /** The caller's text, verbatim. */
  text: string;
  /** Connection the prompt was typed against, for logging only. */
  connectionId?: string;
  /** Monotonic id, so a drained prompt can be tied back to what was logged. */
  id: number;
  /** Epoch ms the prompt was queued. */
  queuedAt: number;
}

export interface DrainResult {
  /** Prompts still worth sending, oldest first. */
  deliver: QueuedPrompt[];
  /** Prompts dropped because they exceeded the TTL. */
  expired: QueuedPrompt[];
  /** Prompts dropped because the queue was full. */
  evicted: QueuedPrompt[];
}

export interface OutboundPromptQueueOptions {
  /** Maximum prompts held at once. */
  maxEntries?: number;
  /** Maximum total characters held at once, across all entries. */
  maxChars?: number;
  /**
   * How long a prompt stays worth delivering. A caller who typed a question before a
   * three-minute outage is not still waiting for that specific answer.
   */
  ttlMs?: number;
  /** Injectable clock, so expiry is testable without waiting. */
  now?: () => number;
}

const DEFAULT_MAX_ENTRIES = 8;
const DEFAULT_MAX_CHARS = 4_000;
const DEFAULT_TTL_MS = 30_000;

export class OutboundPromptQueue {
  private entries: QueuedPrompt[] = [];
  private chars = 0;
  private nextId = 1;

  private readonly maxEntries: number;
  private readonly maxChars: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: OutboundPromptQueueOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? (() => Date.now());
  }

  public get size(): number {
    return this.entries.length;
  }

  public get totalChars(): number {
    return this.chars;
  }

  /**
   * Holds a prompt for later delivery.
   *
   * Returns the prompt as it was actually stored, or null if it was not worth holding at all -
   * the caller uses that to tell the user their text was refused rather than queued.
   */
  public enqueue(text: string, connectionId?: string): QueuedPrompt | null {
    if (!text.trim()) return null;

    const entry: QueuedPrompt = {
      text,
      connectionId,
      id: this.nextId++,
      queuedAt: this.now(),
    };

    this.entries.push(entry);
    this.chars += text.length;
    this.enforceBounds(entry);
    return entry;
  }

  /**
   * Drops oldest-first until both caps hold.
   *
   * The newest entry is never the one evicted: if the caller has just typed something, that is
   * the prompt they expect answered.
   */
  private enforceBounds(protectedEntry: QueuedPrompt): void {
    while (this.entries.length > this.maxEntries || this.chars > this.maxChars) {
      if (this.entries.length <= 1 || this.entries[0] === protectedEntry) break;
      const dropped = this.entries.shift();
      if (dropped) this.chars -= dropped.text.length;
    }
  }

  /**
   * Returns everything worth sending and empties the queue.
   *
   * Expiry is evaluated here rather than at enqueue so a prompt's usefulness is judged against
   * the moment it would actually be delivered, not the moment it was typed.
   */
  public drain(): DrainResult {
    const now = this.now();
    const deliver: QueuedPrompt[] = [];
    const expired: QueuedPrompt[] = [];

    for (const entry of this.entries) {
      if (now - entry.queuedAt > this.ttlMs) expired.push(entry);
      else deliver.push(entry);
    }

    const evicted: QueuedPrompt[] = [];
    if (evicted.length === 0 && deliver.length > this.maxEntries) {
      // Defensive: `enforceBounds` should have prevented this, but an over-counted queue must
      // never turn into an unbounded burst of turns against a single recovered connection.
      const overflow = deliver.length - this.maxEntries;
      evicted.push(...deliver.splice(0, overflow));
    }

    this.entries = [];
    this.chars = 0;

    return { deliver, expired, evicted };
  }

  /** Number of prompts currently held, excluding any that have already expired. */
  public pending(): number {
    const now = this.now();
    return this.entries.filter((entry) => now - entry.queuedAt <= this.ttlMs).length;
  }

  /**
   * Discards everything.
   *
   * Used on hard reset, end, and persona switch: a typed turn belongs to one conversation, and
   * the next conversation must not inherit it.
   */
  public clear(): void {
    this.entries = [];
    this.chars = 0;
  }
}
