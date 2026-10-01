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
 * - **Bounded, absolutely.** An outage can last minutes, and a caller can keep typing. Without a
 *   cap this queue is an unbounded string buffer keyed on nothing. `maxEntries` and `maxChars`
 *   both bound it, and the *oldest* entries are evicted first, because the most recent question
 *   is the one the user still cares about getting answered. The character cap is a hard ceiling:
 *   a single prompt that could never fit within it is refused at enqueue rather than admitted as
 *   a special case. The earlier version protected the newest entry from the evictor unconditionally,
 *   which meant one oversized paste could sit in the buffer far above `maxChars` - the documented
 *   bound was not the actual bound.
 * - **Expiring.** A question asked three minutes ago during a long outage is no longer what the
 *   user is waiting for; replaying it into a recovered call produces a confusing, stale turn.
 *   Entries older than `ttlMs` are discarded on drain and reported, never silently delivered.
 * - **Session-scoped.** The queue is cleared outright on hard reset, end, and persona switch. A
 *   typed question is bound to the conversation it was typed into; replaying it into a new
 *   persona's session would leak one business's caller detail into another's context.
 * - **Not a transcript.** This queue carries no view of what the caller sees. The caller commits
 *   their turn to the transcript, memory, and conversation runtime at the moment they type it, and
 *   this only guarantees it reaches the provider. Keeping those two concerns separate is what
 *   lets a prompt be held here without being rendered twice.
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

/** Why a prompt was not taken, so the caller can say something true to the user. */
export type EnqueueRejection = 'EMPTY' | 'TOO_LARGE';

export type EnqueueOutcome =
  | { accepted: true; entry: QueuedPrompt }
  | { accepted: false; reason: EnqueueRejection };

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
   * The outcome distinguishes the two ways a prompt can be refused, because they need different
   * messages to the user: an empty turn is nothing to say about, whereas an oversized one is a
   * length limit the caller has to act on. Collapsing both into `null` is what previously made
   * the UI report "still reconnecting" for a message that could never have been held.
   *
   * Local state is deliberately *not* committed here. The caller commits the turn to its
   * transcript, memory, and conversation runtime as soon as the user types, so a held prompt is
   * already visible to the user; this queue owns only provider delivery.
   */
  public enqueue(text: string, connectionId?: string): EnqueueOutcome {
    if (!text.trim()) return { accepted: false, reason: 'EMPTY' };

    // A single prompt larger than the entire budget can never satisfy the cap, so admitting it
    // would either break the bound or leave the evictor with no legal move. Refuse it instead and
    // let the caller tell the user to shorten the message.
    if (text.length > this.maxChars) return { accepted: false, reason: 'TOO_LARGE' };

    const entry: QueuedPrompt = {
      text,
      connectionId,
      id: this.nextId++,
      queuedAt: this.now(),
    };

    this.entries.push(entry);
    this.chars += text.length;
    this.enforceBounds(entry);
    return { accepted: true, entry };
  }

  /**
   * Drops oldest-first until both caps hold.
   *
   * The newest entry is never the one evicted: if the caller has just typed something, that is
   * the prompt they expect answered. The length check in `enqueue` guarantees this loop always
   * has a legal move, so it cannot spin.
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

    // A recovered socket must never be handed a burst of turns at once: the provider would see
    // several questions as one incoherent message. `enforceBounds` should already have prevented
    // this, but the check stays because an over-counted queue must not become a flood.
    const evicted: QueuedPrompt[] = [];
    if (deliver.length > this.maxEntries) {
      evicted.push(...deliver.splice(0, deliver.length - this.maxEntries));
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
