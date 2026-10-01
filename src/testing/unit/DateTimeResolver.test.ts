import { TestHarness, TestResult } from '../TestHarness';
import { TemporalParser } from '../../core/time/TemporalParser';
import { DateTimeResolver } from '../../core/time/DateTimeResolver';
import { AvailabilityWindow } from '../../core/time/AvailabilityWindow';
import { SchedulingPolicy } from '../../core/time/SchedulingPolicy';

export async function runDateTimeResolverTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Parses explicit temporal phrases
  results.push(
    await TestHarness.runTest('DateTimeResolver', 'Parses natural date and time expressions', () => {
      const parsed = TemporalParser.parse('I would like an appointment tomorrow at 2 PM');
      TestHarness.assertEqual(parsed.dateExpr, 'tomorrow', 'Extracted dateExpr must be tomorrow');
      TestHarness.assertEqual(parsed.timeExpr?.toLowerCase(), '2 pm', 'Extracted timeExpr must be 2 pm');
    })
  );

  // Test 2: Resolves relative date with persona timezone
  results.push(
    await TestHarness.runTest('DateTimeResolver', 'Resolves relative date expression "tomorrow" to ISO format', () => {
      const refDate = new Date('2026-09-29T10:00:00Z');
      const resolved = DateTimeResolver.resolve('tomorrow at 2 PM', 'aura-salon', refDate);

      TestHarness.assert(resolved.date !== null, 'Resolved date must exist');
      TestHarness.assertEqual(resolved.date?.iso, '2026-09-30', 'Tomorrow from Sep 29 must resolve to 2026-09-30');
      TestHarness.assertEqual(resolved.time?.time24, '14:00', '2 PM must resolve to 14:00');
    })
  );

  // Slot generation must exclude every slot that *overlaps* a booking, not only the exact
  // start time. This test exists because the original implementation compared start times for
  // equality, which is a real double-booking: book 09:00 for a 60-minute service and 09:45 was
  // still offered, so the second caller would be given a slot that overlaps the first.
  //
  // The buffer is equally load-bearing and was fetched but never applied: a 15-minute buffer
  // after a 60-minute booking at 09:00 means nothing may start before 10:15.
  results.push(
    await TestHarness.runTest('DateTimeResolver', 'no offered slot overlaps an existing booking or its buffer', () => {
      const personaId = 'aura-salon';
      const duration = SchedulingPolicy.getDurationForService('Full Color', personaId); // 90 min
      const buffer = SchedulingPolicy.getPolicy(personaId).bufferMinutes;

      // A Monday, so the day is open under the salon's published hours.
      const date = '2026-01-05';
      const open = AvailabilityWindow.generateSlots(date, 'Full Color', personaId, new Set());
      TestHarness.assert(open.length > 0, 'an open Monday must offer slots to test against');

      const firstStart = open[0].startTime;

      // Book it, then ask what is still available.
      const afterBooking = AvailabilityWindow.generateSlots(
        date,
        'Full Color',
        personaId,
        new Set([firstStart])
      );

      const toMinutes = (hhmm: string): number => {
        const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
        return h * 60 + m;
      };

      const bookedStart = toMinutes(firstStart);
      const blockedUntil = bookedStart + duration + buffer;

      TestHarness.assert(
        !afterBooking.some((s) => s.startTime === firstStart),
        'the booked start time itself must not be offered again'
      );

      // Each candidate slot occupies [start, start+duration). It is rejected if that interval
      // intersects the booked interval grown by the buffer on both sides.
      const overlaps = (slotStart: number): boolean =>
        slotStart < blockedUntil + buffer && bookedStart - buffer < slotStart + duration;

      for (const slot of afterBooking) {
        TestHarness.assert(
          !overlaps(toMinutes(slot.startTime)),
          `slot ${slot.startTime} overlaps the ${duration}-minute booking at ${firstStart} ` +
            `or its ${buffer}-minute buffer (blocked until ${blockedUntil})`
        );
      }

      // The check has to be capable of failing. If every slot after the booking were already
      // excluded for an unrelated reason - a closed day, an empty result - this test would
      // pass while the overlap bug was still present.
      TestHarness.assert(
        afterBooking.length < open.length,
        'booking a slot must actually reduce what is offered, or the assertions above are vacuous'
      );
    })
  );

  return results;
}
