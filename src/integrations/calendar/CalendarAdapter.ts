import { AvailabilityWindow, CalculatedSlot } from '../../core/time/AvailabilityWindow';
import { TimezoneService } from '../../core/time/TimezoneService';
import { AppointmentStore, type StoredAppointment } from '../../persistence/stores/AppointmentStore';
import { PrivacySanitizer } from '../../core/diagnostics/PrivacySanitizer';
import { SchedulingPolicy } from '../../core/time/SchedulingPolicy';

export interface AppointmentRecord {
  id: string;
  personaId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  service: string;
  date: string; // ISO date YYYY-MM-DD
  startTime: string; // 24hr "14:00"
  endTime: string; // 24hr "15:00"
  timezone: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED';
  createdAt: number;
  idempotencyKey?: string;
}

export type AvailableSlot = CalculatedSlot;

export class CalendarAdapter {
  /**
   * F-20: availability is now read from the durable store rather than a process-local `Map`.
   *
   * The old in-memory map meant availability answers depended on which function instance
   * happened to serve the request, so a slot could be offered to one caller and already taken
   * for another. On Vercel, where instances are recycled and load-balanced, that was not a
   * theoretical risk.
   */
  public static checkAvailability(
    personaId: string,
    isoDate: string,
    service = 'Haircut'
  ): AvailableSlot[] {
    const bookedTimes = new Set<string>();

    // Fail closed. This used to catch the read error and carry on with an empty booked set,
    // which is the worst possible response to an unreadable journal: every slot would be
    // reported as open, and the caller would be offered times that are already taken. Not
    // knowing what is booked is not the same as knowing nothing is booked.
    let appointments: StoredAppointment[];
    try {
      appointments = AppointmentStore.list();
    } catch (err: any) {
      console.error(`[CalendarAdapter] Cannot read existing bookings, offering no slots: ${err?.message}`);
      return [];
    }

    for (const apt of appointments) {
      if (apt.personaId === personaId && apt.date === isoDate && apt.status === 'CONFIRMED') {
        bookedTimes.add(apt.startTime);
      }
    }

    return AvailabilityWindow.generateSlots(isoDate, service, personaId, bookedTimes);
  }

  /**
   * Atomically creates an appointment with idempotency protection and durable storage.
   *
   * The ordering here is deliberate. Idempotency is checked first, then the conflict check
   * against freshly read durable state, and only then is anything written. If the write cannot
   * be made durable the booking is refused, because a booking the server cannot keep is a
   * booking it must not tell the caller is confirmed.
   */
  public static createAppointment(params: {
    personaId: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    service: string;
    date: string;
    startTime: string;
    idempotencyKey?: string;
    timezone?: string;
  }): { success: boolean; appointment?: AppointmentRecord; error?: string } {
    // 1. Idempotency Check - against durable state, so a retry after a process restart or a
    // second instance returns the original booking instead of creating a duplicate.
    if (params.idempotencyKey) {
      const existing = AppointmentStore.findByIdempotencyKey(params.idempotencyKey);
      if (existing) {
        console.log(`[CalendarAdapter] Idempotent hit for key: ${params.idempotencyKey}`);
        return { success: true, appointment: existing as AppointmentRecord };
      }
    }

    // 2. Conflict check against the freshest state, not a process-local snapshot. The duration
    // is passed so the check reasons about the interval this booking will occupy, rather than
    // only whether the exact start time is already on the calendar.
    const requestedDuration = SchedulingPolicy.getDurationForService(params.service, params.personaId);
    if (AppointmentStore.isSlotTaken(params.personaId, params.date, params.startTime, requestedDuration)) {
      return { success: false, error: 'CONFLICT: that time overlaps an existing appointment.' };
    }

    // 3. Compute End Time (default 45-60 min)
    // The end time is derived from the *service's* duration, not a hardcoded hour.
    //
    // It was `start + 1 hour` regardless of service, so a 90-minute colour was recorded as
    // ending after 60 minutes. Every later overlap check reasons about the occupied interval,
    // and an end time that is wrong by 30 minutes makes the whole calendar's occupancy a
    // guess. The stored `durationMinutes` is what lets `isSlotTaken` reason about the real
    // span of a booking made before this was fixed.
    const durationMinutes = SchedulingPolicy.getDurationForService(params.service, params.personaId);
    const [hStr, mStr] = params.startTime.split(':');
    const startTotal = parseInt(hStr, 10) * 60 + parseInt(mStr || '0', 10);
    const endTotal = startTotal + durationMinutes;
    const endTime = `${Math.floor(endTotal / 60).toString().padStart(2, '0')}:${(endTotal % 60)
      .toString()
      .padStart(2, '0')}`;

    const appointment: AppointmentRecord & { durationMinutes: number } = {
      id: `apt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      personaId: params.personaId,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      customerPhone: params.customerPhone,
      service: params.service,
      date: params.date,
      startTime: params.startTime,
      endTime,
      durationMinutes,
      timezone: params.timezone || TimezoneService.DEFAULT_TIMEZONE,
      status: 'CONFIRMED',
      createdAt: Date.now(),
      idempotencyKey: params.idempotencyKey,
    };

    // 4. Durable write. A booking that cannot be persisted is NOT a confirmed booking.
    const written = AppointmentStore.persist(appointment);
    if (!written.ok) {
      console.error(`[AppointmentStore] Refusing to confirm ${appointment.id}: ${written.reason}`);
      return {
        success: false,
        error: 'PERSISTENCE_FAILED: the booking could not be saved, so it is not confirmed.',
      };
    }

    console.log(
      `[CalendarAdapter] Created appointment ${appointment.id} ` +
        `for ${PrivacySanitizer.redactEmail(appointment.customerEmail)} ` +
        `on ${appointment.date} at ${appointment.startTime}`
    );
    return { success: true, appointment };
  }

  /**
   * Cancels an appointment durably.
   */
  public static cancelAppointment(appointmentId: string): boolean {
    return AppointmentStore.updateStatus(appointmentId, 'CANCELLED');
  }

  public static getAppointmentsForCustomer(email: string): AppointmentRecord[] {
    // An unreadable journal means we cannot answer, which is not the same as "no bookings".
    // Returning a truncated or empty answer here would tell a caller their appointment is gone.
    let appointments: AppointmentRecord[];
    try {
      appointments = AppointmentStore.list();
    } catch (err: any) {
      console.error(`[CalendarAdapter] Cannot read bookings for a customer lookup: ${err?.message}`);
      throw new Error('Booking records are currently unavailable');
    }
    return appointments.filter(
      (a) => a.customerEmail.toLowerCase() === email.toLowerCase() && a.status === 'CONFIRMED'
    );
  }
}
