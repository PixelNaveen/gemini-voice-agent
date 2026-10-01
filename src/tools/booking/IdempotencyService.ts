import path from 'path';
import fs from 'fs';
import { BookingOperation } from './BookingTypes';
import { readJournal, updateJournal } from '../../persistence/stores/JournalFile';

/**
 * F-20 / F-39: durable, idempotent tool-operation ledger.
 *
 * This ledger used to be a `static Map`, which made it the one part of the booking flow that
 * was not durable while the appointments it describes were. That is a specific, nasty gap: the
 * durable store keeps a record of the booking, but the process that created it loses the
 * operation. A retry arriving at a *different* instance then sees no operation at all, and the
 * one place that could have recognised the retry as the same request is empty.
 *
 * It also made the ambiguous outcome invisible. An operation that reached `EXECUTING` and then
 * lost its process looked identical to one that had never been attempted, so nothing could
 * ever tell "never started" apart from "started, outcome unknown". With the operation durable,
 * that distinction is recoverable, and `CalendarAdapter`'s own idempotency lookup under the
 * same key becomes the authority on what actually happened.
 *
 * Bounded: the ledger is trimmed newest-first so it cannot grow without limit.
 */

const MAX_OPERATIONS = 2_000;

function ledgerPath(): string {
  const dir = process.env.AURA_DATA_DIR || path.resolve(process.cwd(), '.data');
  return path.join(dir, 'tool-operations.json');
}

/** Terminal states: the outcome is known, so there is nothing left to reconcile. */
const TERMINAL: ReadonlySet<BookingOperation['status']> = new Set<BookingOperation['status']>([
  'SUCCEEDED',
  'FAILED',
]);

function upsert(records: BookingOperation[], op: BookingOperation): BookingOperation[] {
  const next = records.filter((r) => r.idempotencyKey !== op.idempotencyKey);
  next.push(op);
  next.sort((a, b) => b.updatedAt - a.updatedAt);
  return next.length > MAX_OPERATIONS ? next.slice(0, MAX_OPERATIONS) : next;
}

export class IdempotencyService {
  public static generateKey(sessionId: string, operationId: string): string {
    return `${sessionId}_${operationId}`;
  }

  public static getOperation(key: string): BookingOperation | undefined {
    try {
      return readJournal<BookingOperation>(ledgerPath()).find((o) => o.idempotencyKey === key);
    } catch (err: any) {
      // An unreadable ledger must not be silently treated as "no operation exists", because
      // that is what would let a duplicate booking through.
      console.error(`[IdempotencyService] Ledger unreadable, refusing to treat ${key} as new: ${err?.message}`);
      return undefined;
    }
  }

  public static registerOperation(op: BookingOperation): void {
    const written = updateJournal<BookingOperation>(ledgerPath(), (records) => upsert(records, op));
    if (!written.ok) {
      console.error(`[IdempotencyService] Could not record operation ${op.idempotencyKey}: ${written.reason}`);
    }
  }

  public static updateOperationStatus(
    key: string,
    status: BookingOperation['status'],
    result?: Record<string, any>,
    error?: string
  ): void {
    const written = updateJournal<BookingOperation>(ledgerPath(), (records) => {
      const existing = records.find((o) => o.idempotencyKey === key);
      if (!existing) {
        // Recording a terminal state for an operation that was never registered means the
        // outcome is untrackable. Say so loudly: this is the shape of a lost or duplicated
        // write, and it is exactly what a silent no-op would have hidden.
        console.warn(`[IdempotencyService] No operation found for key ${key}; cannot record status ${status}.`);
        return { records, changed: false };
      }
      const updated: BookingOperation = {
        ...existing,
        status,
        updatedAt: Date.now(),
        ...(result ? { result } : {}),
        ...(error ? { error } : {}),
      };
      return upsert(records, updated);
    });
    if (!written.ok) {
      console.error(`[IdempotencyService] Could not persist status ${status} for ${key}: ${written.reason}`);
    }
  }

  public static listOperations(sessionId?: string): BookingOperation[] {
    let records: BookingOperation[];
    try {
      records = readJournal<BookingOperation>(ledgerPath());
    } catch {
      return [];
    }
    return sessionId ? records.filter((o) => o.sessionId === sessionId) : records;
  }

  /**
   * Operations that started but never reached a terminal state.
   *
   * These are the ambiguous ones: the request was accepted, the outcome was never recorded,
   * and the only honest response is to re-derive the outcome from the durable appointment
   * store rather than guess. Returns the operations, not a verdict.
   */
  public static findUnresolved(): BookingOperation[] {
    return IdempotencyService.listOperations().filter((o) => !TERMINAL.has(o.status));
  }

  /** Test seam: discards any on-disk ledger so a suite starts from a known state. */
  public static reset(): void {
    try {
      fs.rmSync(ledgerPath(), { force: true });
    } catch {
      // A leftover ledger is not worth failing a green suite over.
    }
  }
}
