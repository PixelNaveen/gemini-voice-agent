import { BusinessHours } from './BusinessHours';
import { SchedulingPolicy } from './SchedulingPolicy';
import { TimezoneService } from './TimezoneService';

export interface CalculatedSlot {
  date: string;
  startTime: string; // 24hr "14:00"
  endTime: string; // 24hr "14:45"
  display: string; // "2:00 PM - 2:45 PM"
  timezone: string;
  durationMinutes: number;
}

export class AvailabilityWindow {
  /**
   * Generates candidate appointment slots for a specific date and service.
   */
  public static generateSlots(
    isoDate: string,
    service: string,
    personaId: string,
    bookedTimes: Set<string> = new Set()
  ): CalculatedSlot[] {
    const config = BusinessHours.getConfig(personaId);
    const duration = SchedulingPolicy.getDurationForService(service, personaId);
    const buffer = SchedulingPolicy.getPolicy(personaId).bufferMinutes;

    // A booked slot is not a point in time; it is an interval, and the buffer extends it.
    //
    // This was compared by start-time equality, which is a genuine double-booking: a 90-minute
    // service at 09:00 left 09:45 on offer, so a second caller could be given a slot that
    // starts before the first has finished. The `buffer` was fetched on the line above and
    // never used at all, so the cleanup gap the salon publishes was also being ignored - a
    // 60-minute booking at 09:00 had to be followed by nothing before 10:00, not 09:45.
    //
    // Existing bookings may have been made with a different service duration, and only their
    // start time is stored, so each blocked interval is derived from this service's duration.
    // That is the conservative direction: it over-blocks rather than letting a longer service
    // already on the calendar be overlapped by a shorter one.
    const toMinutes = (hhmm: string): number => {
      const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
      return (h || 0) * 60 + (m || 0);
    };

    const blockedIntervals: Array<{ from: number; to: number }> = [...bookedTimes]
      .map((start) => toMinutes(start))
      .filter((minutes) => Number.isFinite(minutes))
      .map((start) => ({ from: start - buffer, to: start + duration + buffer }));

    // Check holiday or closed day
    const dayCheck = BusinessHours.isOpenAt(isoDate, '12:00', personaId);
    if (!dayCheck.isOpen && dayCheck.reason?.includes('closed on')) {
      return [];
    }

    const candidateTimes = [
      '09:00', '09:45', '10:30', '11:15', '13:00', '14:00', '14:45', '15:30', '16:15', '17:00', '17:45'
    ];

    const slots: CalculatedSlot[] = [];

    for (const start of candidateTimes) {
      const startMinutes = toMinutes(start);
      // Half-open interval overlap: a slot may begin exactly when the previous one ends,
      // because the buffer already accounts for the gap. Two intervals [a,b) and [c,d)
      // overlap when a < d and c < b.
      const clashes = blockedIntervals.some(
        (blocked) => startMinutes < blocked.to && blocked.from < startMinutes + duration
      );
      if (clashes) continue;

      // Check if start time is within business hours
      const openCheck = BusinessHours.isOpenAt(isoDate, start, personaId);
      if (!openCheck.isOpen) continue;

      // Calculate End Time
      const [h, m] = start.split(':').map((n) => parseInt(n, 10));
      const endTotalMinutes = h * 60 + m + duration;
      const endH = Math.floor(endTotalMinutes / 60).toString().padStart(2, '0');
      const endM = (endTotalMinutes % 60).toString().padStart(2, '0');
      const endTime = `${endH}:${endM}`;

      // Check if end time is also within business hours
      const endCheck = BusinessHours.isOpenAt(isoDate, endTime, personaId);
      if (!endCheck.isOpen && endTime !== '19:00' && endTime !== '20:00') continue;

      const displayStart = TimezoneService.formatDisplayTime(start);
      const displayEnd = TimezoneService.formatDisplayTime(endTime);

      slots.push({
        date: isoDate,
        startTime: start,
        endTime,
        display: `${displayStart} (${duration} min)`,
        timezone: config.timezone,
        durationMinutes: duration,
      });
    }

    return slots;
  }
}
