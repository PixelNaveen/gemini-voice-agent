import fs from 'fs';
import path from 'path';
import { readJournal, updateJournal } from './JournalFile';
import { DependencyHealth } from '../../observability/DependencyHealth';

/**
 * F-20: durable appointment storage.
 *
 * Every booking lived in a `static Map` on `CalendarAdapter`. That map dies with the process,
 * so on Vercel - where a function instance is recycled constantly and there is no guarantee any
 * two requests reach the same instance - a caller could be told an appointment was confirmed
 * and then find that nothing existed. A restart lost every booking, and two instances could
 * each believe the same slot was free.
 *
 * This store is a thin write-through journal over the filesystem. It is deliberately not a
 * database: the deployment target has no durable volume, so a real product would point this
 * at a hosted store. What matters here is that the *interface* is a real persistence boundary
 * with a durable write and a reload-on-boot, rather than process memory pretending to be one.
 *
 * Properties that matter for correctness:
 *
 * - **Atomic writes.** Written to a temp file and renamed, so a crash mid-write cannot leave a
 *   half-written journal that silently loses every appointment.
 * - **Cross-instance conflict awareness.** The journal is re-read before each write and before
 *   a conflict check, so two instances sharing a volume cannot both claim one slot.
 * - **Bounded.** The journal is capped and trimmed, so it cannot grow without limit.
 * - **Honest about failure.** If a write cannot be made durable, the booking is refused rather
 *   than reported as confirmed. A booking that was never persisted must never be spoken as
 *   confirmed, which is the exact fabrication this project exists to prevent.
 */

export interface StoredAppointment {
  id: string;
  personaId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  service: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED';
  createdAt: number;
  idempotencyKey?: string;
  /**
   * How long this appointment occupies the calendar.
   *
   * Recorded because slot occupancy is an interval, not an instant: a 90-minute colour
   * appointment blocks everything that starts before it ends. Without the stored duration an
   * existing booking's span has to be guessed from whatever duration is being attempted, which
   * is right only when both are the same length.
   */
  durationMinutes?: number;
}

/** Used when a booking's own duration is unknown, so an interval is still an interval. */
const DEFAULT_BOOKING_DURATION_MINUTES = 60;

/** Newest-first retention bound, so the journal cannot grow without limit. */
const MAX_RECORDS = 5_000;

function journalPath(): string {
  const dir = process.env.AURA_DATA_DIR || path.resolve(process.cwd(), '.data');
  return path.join(dir, 'appointments.json');
}


export class AppointmentStore {
  private static cache: Map<string, StoredAppointment> | null = null;

  /**
   * Reads the journal from disk, once per process.
   *
   * The cache is a read optimization only. Every write re-reads first, so a second instance
   * that has been running since before this record existed still cannot overwrite it.
   */
  private static read(): Map<string, StoredAppointment> {
    if (AppointmentStore.cache) return AppointmentStore.cache;
    const file = journalPath();
    const map = new Map<string, StoredAppointment>();
    try {
      for (const record of readJournal<StoredAppointment>(file)) map.set(record.id, record);
      // A journal that just parsed is a real observation, and it is what lets readiness pass.
      // Reporting it is what stops `/health` from claiming the booking store is fine on the
      // strength of a process that has never opened it.
      DependencyHealth.updateStatus('CalendarStore', 'HEALTHY', 'appointment journal readable');
    } catch (err: any) {
      // A corrupt journal must not take the process down, but it must be loud: silently
      // starting empty would let the server re-book slots that are actually taken.
      console.error(`[AppointmentStore] Journal at ${file} could not be read: ${err?.message}`);
      console.error('[AppointmentStore] Refusing to serve bookings until it is repaired, to avoid double-booking.');
      DependencyHealth.updateStatus('CalendarStore', 'DOWN', `journal unreadable: ${err?.message}`);
      throw new Error('Appointment journal is unreadable');
    }
    AppointmentStore.cache = map;
    return map;
  }

  /**
   * Re-reads from disk, discarding the cache.
   *
   * Called before every write and conflict check so that a decision is made against the
   * freshest state rather than a snapshot that may be minutes old.
   */
  public static refresh(): Map<string, StoredAppointment> {
    AppointmentStore.cache = null;
    return AppointmentStore.read();
  }

  /**
   * Durably writes the record.
   *
   * Returns false rather than throwing, because the caller must decide whether to refuse a
   * booking. Swallowing the error and returning a "success" appointment is precisely the bug
   * this store exists to prevent.
   *
   * The whole read-modify-write runs under a cross-process lock. Re-reading before writing
   * narrows the window but does not close it: without a lock, two instances can both read the
   * journal, both decide the 14:00 slot is free, and the second write silently discards the
   * first booking. The caller would have been told the slot was theirs, and it would not be.
   */
  public static persist(appointment: StoredAppointment): { ok: true } | { ok: false; reason: string } {
    const written = updateJournal<StoredAppointment>(journalPath(), (records) => {
      const map = new Map<string, StoredAppointment>();
      for (const record of records) map.set(record.id, record);
      map.set(appointment.id, appointment);

      const sorted = [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
      if (sorted.length > MAX_RECORDS) {
        // Drop the oldest, and say so. Silent truncation of a booking journal would be
        // indistinguishable from data loss.
        console.warn(
          `[AppointmentStore] Journal exceeded ${MAX_RECORDS} records; dropping the ${sorted.length - MAX_RECORDS} oldest.`
        );
        return sorted.slice(0, MAX_RECORDS);
      }
      return sorted;
    });

    if (!written.ok) {
      console.error(`[AppointmentStore] Refusing to persist ${appointment.id}: ${written.reason}`);
      return written;
    }
    AppointmentStore.cache = new Map(written.records.map((r) => [r.id, r]));
    return { ok: true };
  }

  /** Persists a status change, e.g. a cancellation. */
  public static updateStatus(id: string, status: StoredAppointment['status']): boolean {
    const written = updateJournal<StoredAppointment>(journalPath(), (records) => {
      const map = new Map<string, StoredAppointment>();
      for (const record of records) map.set(record.id, record);
      const existing = map.get(id);
      // Nothing to cancel. Reported as a no-op rather than a silent rewrite of the journal.
      if (!existing) return { records, changed: false };
      map.set(id, { ...existing, status });
      return [...map.values()];
    });

    if (!written.ok) {
      console.error(`[AppointmentStore] Could not persist status change for ${id}: ${written.reason}`);
      return false;
    }
    const exists = written.records.some((r) => r.id === id);
    if (!exists) return false;
    AppointmentStore.cache = new Map(written.records.map((r) => [r.id, r]));
    return true;
  }

  /**
   * True when a confirmed appointment already occupies this exact slot for this persona.
   *
   * Called immediately before a create, against freshly read state, which is what stops two
   * concurrent calls from both being told the 14:00 slot is theirs.
   */
  /**
   * Whether a booking may be written for this start time, treating an occupied slot as an
   * interval rather than a point.
   *
   * This compared start times for equality, so the write path would happily accept 09:45
   * alongside an existing 09:00 booking. Reading availability already excluded overlaps, but
   * this check is the one that actually decides whether a booking is *written* - and a
   * second caller who asks for 09:45 directly, or two callers racing, both go through here.
   * Offer-and-then-book is not a guarantee; the write is.
   *
   * `durationMinutes` is the duration of the booking being attempted. Existing appointments
   * store only a start time, so their occupied span is derived from that same duration, which
   * over-blocks rather than risking an overlap. An appointment recorded with its own
   * duration uses that instead.
   */
  public static isSlotTaken(
    personaId: string,
    date: string,
    startTime: string,
    durationMinutes?: number
  ): boolean {
    let map: Map<string, StoredAppointment>;
    try {
      map = AppointmentStore.refresh();
    } catch {
      // The journal is unreadable. Treat the slot as taken rather than free: double-booking a
      // real customer is worse than refusing an honest booking.
      return true;
    }

    const toMinutes = (hhmm: string): number => {
      const [h, m] = String(hhmm).split(':').map((n) => parseInt(n, 10));
      return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
    };

    const proposedStart = toMinutes(startTime);
    const proposedDuration =
      Number.isFinite(durationMinutes) && (durationMinutes as number) > 0
        ? (durationMinutes as number)
        : DEFAULT_BOOKING_DURATION_MINUTES;
    const proposedEnd = proposedStart + proposedDuration;

    for (const apt of map.values()) {
      if (apt.personaId !== personaId || apt.date !== date || apt.status !== 'CONFIRMED') continue;
      const existingStart = toMinutes(apt.startTime);
      const existingDuration =
        Number.isFinite(apt.durationMinutes) && (apt.durationMinutes as number) > 0
          ? (apt.durationMinutes as number)
          : proposedDuration;
      // Half-open overlap: touching intervals are fine, intersecting ones are not.
      if (proposedStart < existingStart + existingDuration && existingStart < proposedEnd) {
        return true;
      }
    }
    return false;
  }

  /** Returns the appointment previously created under this idempotency key, if any. */
  public static findByIdempotencyKey(key: string): StoredAppointment | undefined {
    for (const apt of AppointmentStore.refresh().values()) {
      if (apt.idempotencyKey === key) return apt;
    }
    return undefined;
  }

  public static list(): StoredAppointment[] {
    return [...AppointmentStore.refresh().values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Test seam: drops the in-process cache so a suite starts from disk. */
  public static clearCache(): void {
    AppointmentStore.cache = null;
  }
}
