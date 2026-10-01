import fs from 'fs';
import path from 'path';

/**
 * Shared durable-journal mechanics.
 *
 * Appointments and tool operations are two separate records that share the same correctness
 * requirement: a write must be atomic, must not race another *process* holding the same file,
 * and must never be reported as durable when it was not. Keeping that in one place is not just
 * tidiness - two hand-rolled copies of a cross-process lock would inevitably drift, and the
 * second copy is the one nobody tests.
 *
 * What this deliberately is not: a database. The deployment target has no durable volume, so
 * a real product would point these interfaces at a hosted store. What matters is that the
 * boundary is a real one - an atomic, locked, reload-on-boot file - rather than process memory
 * dressed up as persistence.
 */

/** How long a writer waits for a journal lock before giving up and refusing the write. */
const LOCK_TIMEOUT_MS = 2_000;

/** A lock whose owner died must not block every future write forever. */
const LOCK_STALE_MS = 10_000;

const LOCK_RETRY_MS = 5;

export function ensureJournalDir(file: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

/**
 * Acquires an exclusive, cross-process lock on a journal.
 *
 * The lock *is* the file's existence: `open(..., 'wx')` fails when the path already exists, and
 * the OS makes that check atomic. That is the property an in-process mutex cannot provide,
 * because neither process can see the other's memory - and the failure being guarded against is
 * precisely two processes interleaving a read and a write.
 *
 * Returns a release function, or null if the lock could not be taken within the timeout. A
 * caller that cannot take the lock must refuse the write rather than proceed unlocked: an
 * unserialised write can lose a confirmed record, which is worse than an honest refusal.
 */
function acquireLock(lockFile: string): (() => void) | null {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  // Creating the directory can itself fail - a read-only volume, or a path component that
  // exists as a file. That is a refusal to write, not a reason to throw out of a function
  // whose contract is "return null when the lock cannot be taken".
  try {
    ensureJournalDir(lockFile);
  } catch {
    return null;
  }

  for (;;) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return () => {
        try {
          fs.unlinkSync(lockFile);
        } catch {
          // Already gone, which is the state we wanted anyway.
        }
      };
    } catch (err: any) {
      if (err?.code !== 'EEXIST') return null;

      // Reclaim a lock abandoned by a process killed mid-write.
      try {
        const age = Date.now() - fs.statSync(lockFile).mtimeMs;
        if (age > LOCK_STALE_MS) {
          fs.unlinkSync(lockFile);
          continue;
        }
      } catch {
        // The lock vanished between the failed open and the stat; retry immediately.
        continue;
      }

      if (Date.now() >= deadline) return null;
      // Only reached when another writer holds the journal, which is milliseconds of real
      // work rather than a long queue.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_MS);
    }
  }
}

/** Reads a JSON array journal. Returns an empty array when the file does not exist yet. */
export function readJournal<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as T[];
  return Array.isArray(parsed) ? parsed : [];
}

/** Replaces a JSON array journal atomically via write-then-rename. */
function writeJournal<T>(file: string, records: T[]): void {
  ensureJournalDir(file);
  // Write-then-rename: an interrupted write leaves the previous complete journal intact
  // rather than a truncated one that reads as data loss.
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * Runs `mutate` against the freshest journal state while holding the cross-process lock, then
 * writes the result back durably.
 *
 * The whole read-decide-write sequence is inside the lock. Reading inside the lock is the
 * point: a re-read that happens *before* taking the lock narrows the race window but leaves it
 * open, because another process can write between the read and the lock acquisition.
 *
 * Returns `{ ok: false }` rather than throwing, because the caller must decide whether to
 * refuse the operation. Swallowing a write failure and returning success is exactly the
 * fabrication this project exists to prevent.
 */
export function updateJournal<T>(
  file: string,
  mutate: (records: T[]) => T[] | { records: T[]; changed: false }
): { ok: true; records: T[] } | { ok: false; reason: string } {
  const release = acquireLock(`${file}.lock`);
  if (!release) {
    return { ok: false, reason: 'the journal is locked or its directory is unwritable' };
  }
  try {
    const current = readJournal<T>(file);
    const outcome = mutate(current);
    const next = Array.isArray(outcome) ? outcome : outcome.records;
    if (!Array.isArray(outcome) && outcome.changed === false) {
      return { ok: true, records: current };
    }
    writeJournal(file, next);
    return { ok: true, records: next };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? 'unknown persistence failure' };
  } finally {
    release();
  }
}
