import fs from 'fs';
import os from 'os';
import path from 'path';
import { TestHarness, TestResult } from '../TestHarness';
import { BookingService } from '../../application/appointments/BookingService';
import { BookingService as LiveBookingService } from '../../tools/booking/BookingService';
import { IdempotencyService } from '../../tools/booking/IdempotencyService';
import { AppointmentStore } from '../../persistence/stores/AppointmentStore';
import { CalendarAdapter } from '../../integrations/calendar/CalendarAdapter';
import { ToolExecutionContext } from '../../tools/ToolTypes';

export async function runBookingConcurrencyTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // F-20: bookings are now genuinely durable, which means a test run writes to disk that
  // survives the process. Without an isolated directory the suite would permanently consume
  // slots and the second run would fail on its own history - a test that only passes once is
  // worse than no test. Each run therefore gets its own throwaway journal.
  const testDataDir = path.join(os.tmpdir(), `aura-test-bookings-${process.pid}-${Date.now()}`);
  const previousDataDir = process.env.AURA_DATA_DIR;
  process.env.AURA_DATA_DIR = testDataDir;
  AppointmentStore.clearCache();
  IdempotencyService.reset();

  try {
    results.push(...(await runBookingTests()));
  } finally {
    // Restore and remove, so a failed run does not leave a directory behind.
    if (previousDataDir === undefined) delete process.env.AURA_DATA_DIR;
    else process.env.AURA_DATA_DIR = previousDataDir;
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      // A leftover temp directory is not worth failing a green suite over.
    }
  }

  return results;
}

async function runBookingTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Idempotent duplicate booking creates only one record
  results.push(
    await TestHarness.runTest('BookingIntegration', 'Enforces strict idempotency across repeated booking calls', async () => {
      const idempotencyKey = `idemp_test_${Date.now()}`;
      const payload = {
        tenantId: 'tenant_aura_salon',
        sessionId: 'sess_test_1',
        serviceId: 'Haircut',
        serviceName: 'Executive Haircut & Styling',
        customerName: 'Marcus Vance',
        customerEmail: 'marcus.vance@example.com',
        customerPhone: '+1-555-0199',
        date: '2026-10-12',
        time: '14:00',
        idempotencyKey,
      };

      const firstCall = await BookingService.createAppointment(payload);
      const secondCall = await BookingService.createAppointment(payload);

      TestHarness.assertEqual(firstCall.appointmentId, secondCall.appointmentId, 'Repeated call with same key must return existing appointment ID');
      TestHarness.assertEqual(secondCall.status, 'CONFIRMED', 'Status must be CONFIRMED');
    })
  );

  // Test 2: Idempotency ledger state transition
  results.push(
    await TestHarness.runTest('BookingIntegration', 'Tracks tool operation state in idempotency ledger', async () => {
      const key = `key_ledger_${Date.now()}`;
      IdempotencyService.registerOperation({
        idempotencyKey: key,
        sessionId: 'sess_1',
        personaId: 'aura-salon',
        type: 'CREATE',
        operationId: 'op_1',
        payload: { customerEmail: 'test@example.com' },
        status: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const op = IdempotencyService.getOperation(key);
      TestHarness.assert(op !== undefined, 'Operation must exist in ledger');
      TestHarness.assertEqual(op?.status, 'PENDING', 'Initial operation status must be PENDING');

      IdempotencyService.updateOperationStatus(key, 'SUCCEEDED', { id: 'apt_123' });
      const updatedOp = IdempotencyService.getOperation(key);
      TestHarness.assertEqual(updatedOp?.status, 'SUCCEEDED', 'Updated operation status must be SUCCEEDED');
    })
  );

  // Test 3: F-20 - a booking must survive losing the process that made it.
  //
  // Every booking previously lived in a `static Map`, so a restart erased all of them while
  // the caller still believed the appointment existed. This asserts the record is readable
  // from a cold cache, which is what a recycled function instance on Vercel actually looks
  // like.
  results.push(
    await TestHarness.runTest('BookingIntegration', 'A booking survives the loss of the process that created it', async () => {
      const key = `idemp_durable_${Date.now()}`;
      const payload = {
        tenantId: 'tenant_aura_salon',
        sessionId: 'sess_durable',
        serviceId: 'Haircut',
        serviceName: 'Executive Haircut & Styling',
        customerName: 'Durable Test',
        customerEmail: 'durable@example.com',
        customerPhone: '+1-555-0177',
        date: '2026-11-03',
        time: '11:00',
        idempotencyKey: key,
      };

      const created = await BookingService.createAppointment(payload);
      TestHarness.assert(
        Boolean(created.appointmentId),
        'the booking must be created and return an id'
      );

      // Drop the in-process cache, which is what a fresh process or a recycled instance sees.
      AppointmentStore.clearCache();

      const onDisk = AppointmentStore.list().find((a) => a.idempotencyKey === key);
      TestHarness.assert(
        onDisk !== undefined,
        'the booking must be readable after the in-memory cache is discarded'
      );
      TestHarness.assertEqual(
        onDisk?.date,
        '2026-11-03',
        'the durable record must keep the real date'
      );

      // And the idempotency guarantee must hold across that boundary too, otherwise a retry
      // after a restart would create a second appointment for the same caller.
      AppointmentStore.clearCache();
      const retry = await BookingService.createAppointment(payload);
      TestHarness.assertEqual(
        retry.appointmentId,
        created.appointmentId,
        'a retry after a restart must return the original booking, not a duplicate'
      );
    })
  );

  // Test 5: a writer that cannot take the journal lock must refuse the booking.
  //
  // The read-then-write sequence in `persist` has a window: two different processes - two
  // Vercel instances - can both read the journal, both see the 14:00 slot as free, and the
  // second rename discards the first booking. A lock closes that window, and the guarantee
  // that makes the lock safe is that failing to take it is fatal to the booking. A write that
  // cannot be serialised must never be reported as a confirmed appointment.
  results.push(
    await TestHarness.runTest('BookingIntegration', 'Refuses to book when the journal is locked by another writer', async () => {
      const dir = process.env.AURA_DATA_DIR!;
      const lockFile = path.join(dir, 'appointments.json.lock');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(lockFile, '999999', 'utf8');

      try {
        const locked = CalendarAdapter.createAppointment({
          personaId: 'aura-salon',
          customerName: 'Blocked Writer',
          customerEmail: 'blocked@example.com',
          service: 'Haircut',
          date: '2026-11-05',
          startTime: '09:00',
          idempotencyKey: `locked_${Date.now()}`,
        });

        TestHarness.assertEqual(locked.success, false, 'a booking must not be confirmed while the journal is locked');
        TestHarness.assert(
          /PERSISTENCE_FAILED/.test(locked.error ?? ''),
          `the refusal must be a persistence failure, got: ${locked.error}`
        );

        const written = AppointmentStore.list().some(
          (a) => a.customerEmail === 'blocked@example.com'
        );
        TestHarness.assert(!written, 'nothing may be written to the journal while another writer holds the lock');
      } finally {
        fs.rmSync(lockFile, { force: true });
      }

      // The lock must be released after a normal write, or every later booking would be
      // refused by a lock the failed writer left behind.
      const afterRelease = CalendarAdapter.createAppointment({
        personaId: 'aura-salon',
        customerName: 'Unblocked Writer',
        customerEmail: 'unblocked@example.com',
        service: 'Haircut',
        date: '2026-11-05',
        startTime: '09:00',
        idempotencyKey: `unblocked_${Date.now()}`,
      });
      TestHarness.assertEqual(afterRelease.success, true, 'the same slot must book once the lock is free');
      TestHarness.assertEqual(
        fs.existsSync(path.join(dir, 'appointments.json.lock')),
        false,
        'the lock file must not be left behind after a write completes'
      );
    })
  );

  // Test 6: F-39 - an operation interrupted mid-flight is reconciled, not guessed.
  //
  // This runs the *live* path (`tools/booking/BookingService`, the one the `createAppointment`
  // tool actually calls) rather than the DTO-facing facade. The earlier suite proved durability
  // only against the facade, so the guarantees it reported were never exercised on the code
  // that runs in production.
  results.push(
    await TestHarness.runTest('BookingIntegration', 'Reconciles an interrupted booking instead of duplicating it', async () => {
      const key = `reconcile_${Date.now()}`;
      const input = {
        service: 'Haircut',
        isoDate: '2026-11-06',
        time24: '13:00',
        customerName: 'Interrupted Caller',
        customerEmail: 'interrupted@example.com',
        customerPhone: '+1-555-0166',
      };

      // The appointment itself lands durably...
      const landed = CalendarAdapter.createAppointment({
        personaId: 'aura-salon',
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        service: input.service,
        date: input.isoDate,
        startTime: input.time24,
        idempotencyKey: key,
      });
      TestHarness.assertEqual(landed.success, true, 'the appointment must be booked durably');

      // ...but the process that booked it dies before recording the outcome, which is exactly
      // the state a recycled Vercel instance leaves behind.
      IdempotencyService.registerOperation({
        operationId: 'op_interrupted',
        sessionId: 'sess_live',
        personaId: 'aura-salon',
        type: 'CREATE',
        status: 'EXECUTING',
        idempotencyKey: key,
        payload: input as any,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      TestHarness.assertEqual(
        IdempotencyService.getOperation(key)?.status,
        'EXECUTING',
        'the interrupted operation must be visible on the durable ledger'
      );
      TestHarness.assert(
        IdempotencyService.findUnresolved().some((o) => o.idempotencyKey === key),
        'an operation with no terminal state must be reported as unresolved'
      );

      // The retry arrives at a different process, with no memory of the first attempt.
      const retry = await LiveBookingService.executeBooking(
        liveContext('op_retry', key),
        input
      );

      TestHarness.assertEqual(retry.success, true, 'the retry must resolve successfully');
      TestHarness.assertEqual(
        retry.data?.appointment.id,
        landed.appointment!.id,
        'the retry must return the original booking, not create a second one'
      );

      // And the ambiguity is closed: the operation is no longer unresolved.
      TestHarness.assert(
        !IdempotencyService.findUnresolved().some((o) => o.idempotencyKey === key),
        'a reconciled operation must not remain unresolved'
      );
      const bookings = AppointmentStore.list().filter((a) => a.idempotencyKey === key);
      TestHarness.assertEqual(bookings.length, 1, 'exactly one appointment may exist for the key');
    })
  );

  // Test 4: F-20 - a slot booked once must not be offered to a second caller.
  results.push(
    await TestHarness.runTest('BookingIntegration', 'A durably booked slot is no longer offered as available', async () => {
      const date = '2026-11-04';
      const before = CalendarAdapter.checkAvailability('aura-salon', date, 'Haircut');
      const target = before.find((s) => s.startTime === '10:00') ?? before[0];
      TestHarness.assert(target !== undefined, 'the adapter must offer at least one slot to test against');

      const first = CalendarAdapter.createAppointment({
        personaId: 'aura-salon',
        customerName: 'First Caller',
        customerEmail: 'first@example.com',
        service: 'Haircut',
        date,
        startTime: target!.startTime,
        idempotencyKey: `slot_${Date.now()}`,
      });
      TestHarness.assertEqual(first.success, true, 'the first booking must succeed');

      // Re-read availability as a different request would, from a cold cache.
      AppointmentStore.clearCache();
      const after = CalendarAdapter.checkAvailability('aura-salon', date, 'Haircut');
      TestHarness.assert(
        !after.some((s) => s.startTime === target!.startTime),
        'a durably booked slot must disappear from availability for the next caller'
      );

      // A second attempt at the same slot must be refused, not silently accepted.
      const second = CalendarAdapter.createAppointment({
        personaId: 'aura-salon',
        customerName: 'Second Caller',
        customerEmail: 'second@example.com',
        service: 'Haircut',
        date,
        startTime: target!.startTime,
        idempotencyKey: `slot2_${Date.now()}`,
      });
      TestHarness.assertEqual(second.success, false, 'a double booking must be refused');
      TestHarness.assert(
        /CONFLICT/.test(second.error ?? ''),
        `the refusal must be a conflict, got: ${second.error}`
      );
    })
  );

  return results;
}

/** Minimal tool context for exercising the live booking path the agent actually calls. */
function liveContext(operationId: string, idempotencyKey?: string): ToolExecutionContext {
  return {
    sessionId: 'sess_live',
    personaId: 'aura-salon',
    operationId,
    idempotencyKey,
    timestamp: Date.now(),
    toolName: 'createAppointment',
    isConfirmedByUser: true,
  };
}
