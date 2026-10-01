import { TestHarness, TestResult } from '../TestHarness';
import { DependencyHealth } from '../../observability/DependencyHealth';
import { AlertManager } from '../../observability/AlertManager';
import {
  detectTopology,
  reportPersistenceTopology,
  REQUIREMENTS_FOR_SHARED_PERSISTENCE,
} from '../../persistence/PersistenceTopology';
import { AppointmentStore } from '../../persistence/stores/AppointmentStore';
import { CalendarAdapter } from '../../integrations/calendar/CalendarAdapter';
import { toFunctionResponse } from '../../tools/FunctionCalling';
import { ErrorManager } from '../../core/errors';
import { ErrorCode } from '../../core/errors/ErrorCode';
import { ErrorClassifier } from '../../core/errors/ErrorClassifier';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * F-21: a health check that cannot lie, and alerts that can actually fire.
 *
 * The modules under test previously imported real classes and could therefore look alive while
 * every threshold they checked was permanently zero - `AlertManager` read a metrics system
 * nothing incremented, and `DependencyHealth` was pre-seeded with `HEALTHY` entries for
 * dependencies it had never touched. These tests assert the opposite property: unobserved is
 * not healthy, and a threshold crossing is a real event.
 */
export async function runObservabilityTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(
    await TestHarness.runTest('Observability', 'An unobserved dependency is not healthy', () => {
      DependencyHealth.reset();

      // Before anything has been observed, the system must not claim readiness. Reporting
      // ready here is the original defect: it would let an orchestrator route callers to an
      // instance that has not proven it can keep a booking.
      TestHarness.assert(
        !DependencyHealth.isSystemReady(),
        'a system with no observations must not report ready'
      );
      TestHarness.assert(
        DependencyHealth.blocking().length > 0,
        'unobserved required dependencies must be named as blocking'
      );

      DependencyHealth.updateStatus('CalendarStore', 'HEALTHY');
      TestHarness.assert(
        !DependencyHealth.isSystemReady(),
        'one healthy dependency must not make the system ready while another is unobserved'
      );

      DependencyHealth.updateStatus('GeminiLive', 'DEGRADED');
      TestHarness.assert(
        !DependencyHealth.isSystemReady(),
        'a degraded required dependency must block readiness'
      );

      DependencyHealth.updateStatus('GeminiLive', 'HEALTHY');
      TestHarness.assertEqual(
        DependencyHealth.isSystemReady(),
        true,
        'readiness follows observation, not assumption'
      );

      DependencyHealth.updateStatus('CalendarStore', 'DOWN', 'journal unreadable');
      TestHarness.assert(
        !DependencyHealth.isSystemReady(),
        'a dependency reporting DOWN must block readiness'
      );

      DependencyHealth.reset();
    })
  );

  results.push(
    await TestHarness.runTest('Observability', 'Readiness reflects the real state of the booking journal', () => {
      const dataDir = path.join(os.tmpdir(), `aura-test-health-${process.pid}-${Date.now()}`);
      const previous = process.env.AURA_DATA_DIR;
      process.env.AURA_DATA_DIR = dataDir;
      DependencyHealth.reset();
      AppointmentStore.clearCache();

      try {
        fs.mkdirSync(dataDir, { recursive: true });

        // A readable journal is a genuine observation, and is what lets readiness pass.
        fs.writeFileSync(path.join(dataDir, 'appointments.json'), '[]', 'utf8');
        AppointmentStore.clearCache();
        AppointmentStore.list();
        TestHarness.assertEqual(
          DependencyHealth.get('CalendarStore')?.status,
          'HEALTHY',
          'a readable journal must be reported healthy'
        );

        // A corrupt journal is the failure this project cares most about: serving bookings
        // from an empty one would double-book real customers.
        fs.writeFileSync(path.join(dataDir, 'appointments.json'), '{ not json', 'utf8');
        AppointmentStore.clearCache();
        let threw = false;
        try {
          AppointmentStore.list();
        } catch {
          threw = true;
        }
        TestHarness.assert(threw, 'a corrupt journal must refuse to serve rather than read as empty');
        TestHarness.assertEqual(
          DependencyHealth.get('CalendarStore')?.status,
          'DOWN',
          'a corrupt journal must be reported DOWN so readiness fails'
        );
        TestHarness.assertEqual(
          DependencyHealth.isSystemReady(),
          false,
          'a corrupt booking journal must make the instance not ready'
        );
      } finally {
        if (previous === undefined) delete process.env.AURA_DATA_DIR;
        else process.env.AURA_DATA_DIR = previous;
        try {
          fs.rmSync(dataDir, { recursive: true, force: true });
        } catch {
          // A leftover temp directory is not worth failing a green suite over.
        }
        DependencyHealth.reset();
        AppointmentStore.clearCache();
      }
    })
  );

  results.push(
    await TestHarness.runTest('Observability', 'Alerts fire on thresholds the running system records', () => {
      AlertManager.clear();
      DependencyHealth.reset();

      // A healthy system raises nothing. This is the assertion the old implementation could
      // not make, because its rules read counters nothing ever wrote.
      TestHarness.assertEqual(
        AlertManager.evaluateRules({
          replacementsRequested: 0,
          replacementsSucceeded: 0,
          replacementsFailed: 0,
          toolCalls: 0,
          toolFailures: 0,
          rateLimited: 0,
          unauthorized: 0,
          protocolRejections: 0,
        }).length,
        0,
        'a healthy system must raise no alerts'
      );

      // Losing recovery means callers are being dropped without being told.
      const recovery = AlertManager.evaluateRules({
        replacementsRequested: 6,
        replacementsSucceeded: 0,
        replacementsFailed: 5,
        toolCalls: 20,
        toolFailures: 1,
        rateLimited: 0,
        unauthorized: 0,
        protocolRejections: 0,
      });
      TestHarness.assert(
        recovery.some((a) => a.severity === 'CRITICAL' && /recovery/i.test(a.title)),
        'failing replacement connections must raise a critical alert'
      );

      // A high tool failure rate is a fabrication risk before it is an availability problem.
      const toolFailures = AlertManager.evaluateRules({
        replacementsRequested: 0,
        replacementsSucceeded: 0,
        replacementsFailed: 0,
        toolCalls: 20,
        toolFailures: 18,
        rateLimited: 0,
        unauthorized: 0,
        protocolRejections: 0,
      });
      TestHarness.assert(
        toolFailures.some((a) => a.severity === 'CRITICAL' && /tool calls/i.test(a.title)),
        'a majority-failing tool layer must raise a critical alert'
      );

      // A small number of failures must not cry wolf.
      const mild = AlertManager.evaluateRules({
        replacementsRequested: 0,
        replacementsSucceeded: 0,
        replacementsFailed: 0,
        toolCalls: 20,
        toolFailures: 1,
        rateLimited: 0,
        unauthorized: 0,
        protocolRejections: 0,
      });
      TestHarness.assertEqual(mild.length, 0, 'a low failure count must not alert');

      // A dependency reporting itself unhealthy raises a signal without anyone remembering
      // to look, which is the point of wiring the registry in at all.
      DependencyHealth.updateStatus('CalendarStore', 'DOWN', 'journal unreadable');
      const withDependency = AlertManager.evaluateRules({
        replacementsRequested: 0,
        replacementsSucceeded: 0,
        replacementsFailed: 0,
        toolCalls: 0,
        toolFailures: 0,
        rateLimited: 0,
        unauthorized: 0,
        protocolRejections: 0,
      });
      TestHarness.assert(
        withDependency.some((a) => /CalendarStore/.test(a.title)),
        'an unhealthy dependency must raise an alert'
      );

      DependencyHealth.reset();
      AlertManager.clear();
    })
  );

  results.push(
    await TestHarness.runTest('Observability', 'A pre-gateway tool failure is classified, not hand-rolled', () => {
      // F-22: unknown tool, bad arguments and a throw during dispatch all used to be
      // hand-written strings, so nothing recorded them and no recovery action was decided.
      for (const code of ['NOT_FOUND', 'VALIDATION_ERROR', 'INTERNAL_ERROR'] as const) {
        const handled = ErrorManager.handleToolFailure({ code, message: `raw ${code}` } as any, {
          sessionId: 'sess_1',
          personaId: 'aura-salon',
        });

        TestHarness.assert(
          handled.error.code !== code,
          `${code} must be mapped onto the declared taxonomy, not passed through raw`
        );
        TestHarness.assert(
          handled.action.action.length > 0,
          `${code} must receive a decided recovery action`
        );
        TestHarness.assert(
          handled.spokenMessage.length > 0,
          `${code} must receive a caller-safe line`
        );
        TestHarness.assert(
          !/ECONN|5432|at Object/.test(handled.spokenMessage),
          `${code} must not leak technical detail into the spoken line`
        );
      }

      // An internal fault must not be reported as a misbehaving booking system, which is what
      // falling through to the default classification used to do.
      const internal = ErrorManager.handleToolFailure({
        code: 'INTERNAL_ERROR',
        message: 'TypeError: x is not a function',
      } as any, {});
      TestHarness.assertEqual(
        internal.error.code,
        ErrorCode.TOOL_UNAVAILABLE,
        'an internal fault is our outage, not a bad answer from the booking system'
      );
    })
  );

  results.push(
    await TestHarness.runTest('Observability', 'A tool failure cannot be misread as a success', () => {
      // The model-facing message and the caller-facing line are different audiences. Merging
      // them either loses the instruction not to fabricate, or has a host:port read aloud.
      const response = toFunctionResponse({
        success: false,
        error: { code: 'NOT_FOUND', message: 'The model requested a capability that does not exist.' } as any,
        details: {
          retryable: false,
          recoveryAction: 'ESCALATE',
          spokenMessage: "I don't have a verified answer for that, and I won't guess.",
        },
      }) as any;

      TestHarness.assert(
        /did NOT succeed/.test(response.error.message),
        'the model must be told the action did not happen'
      );
      TestHarness.assert(
        /Do not claim or imply/.test(response.error.message),
        'the model must be told not to claim success'
      );
      TestHarness.assertEqual(
        response.error.spokenMessage,
        "I don't have a verified answer for that, and I won't guess.",
        'the caller-safe line travels in its own field'
      );
      TestHarness.assertEqual(
        response.error.recoveryAction,
        'ESCALATE',
        'the decided recovery action must reach the model'
      );
    })
  );

  results.push(
    await TestHarness.runTest('Observability', 'Business logs do not print caller PII in the clear', async () => {
      // The booking path logged a customer name and email in plaintext to stdout on every
      // successful booking, so any log aggregator would hold a record of every caller. This
      // asserts on what is actually written to the console, not on how the source is formatted.
      const dataDir = path.join(os.tmpdir(), `aura-test-pii-${process.pid}-${Date.now()}`);
      const previous = process.env.AURA_DATA_DIR;
      process.env.AURA_DATA_DIR = dataDir;
      AppointmentStore.clearCache();

      const written: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        written.push(args.map(String).join(' '));
      };

      try {
        fs.mkdirSync(dataDir, { recursive: true });
        const result = CalendarAdapter.createAppointment({
          personaId: 'aura-salon',
          customerName: 'Priya Raman',
          customerEmail: 'priya.raman@example.com',
          customerPhone: '+1-555-0123',
          service: 'Haircut',
          date: '2026-12-01',
          startTime: '15:00',
          idempotencyKey: `pii_${Date.now()}`,
        });
        TestHarness.assertEqual(result.success, true, 'the booking must succeed for this test to mean anything');

        const logText = written.join('\n');
        TestHarness.assert(logText.length > 0, 'the booking must actually log something to check');
        TestHarness.assert(
          !logText.includes('Priya Raman'),
          `a customer name must not reach the log in the clear: ${logText}`
        );
        TestHarness.assert(
          !logText.includes('priya.raman@example.com'),
          `a customer email must not reach the log in the clear: ${logText}`
        );
        TestHarness.assert(
          !logText.includes('+1-555-0123'),
          `a customer phone must not reach the log in the clear: ${logText}`
        );
        TestHarness.assert(
          /p\*\*\*n@example\.com/.test(logText),
          `the email should still be present in redacted form so an operator can correlate: ${logText}`
        );
      } finally {
        console.log = originalLog;
        if (previous === undefined) delete process.env.AURA_DATA_DIR;
        else process.env.AURA_DATA_DIR = previous;
        try {
          fs.rmSync(dataDir, { recursive: true, force: true });
        } catch {
          // A leftover temp directory is not worth failing a green suite over.
        }
        AppointmentStore.clearCache();
      }
    })
  );

  results.push(
    await TestHarness.runTest('Observability', 'An opaque throw still classifies deterministically', () => {
      // A raw `Error` carries no context, so the classifier must land somewhere stable and
      // classified rather than leaking an untyped value into the recovery path.
      const first = ErrorClassifier.classify(new Error('boom'), {});
      const second = ErrorClassifier.classify(new Error('boom'), {});
      TestHarness.assertEqual(
        first.code,
        second.code,
        'the same opaque failure must classify to the same code every time'
      );
      TestHarness.assert(
        first.retryable !== undefined,
        'every classification must decide retryability'
      );
    })
  );

  // ── Persistence topology (F-20/F-11) ──
  //
  // The journal is genuinely durable but instance-local, and on a many-instance platform two
  // servers can each accept the same slot. The file lock makes writes safe inside one machine;
  // it is not a distributed lock. These tests pin the detection that stops that shipping
  // quietly.

  results.push(
    await TestHarness.runTest('Persistence', 'a many-instance platform is detected as unsafe', () => {
      TestHarness.assertEqual(
        detectTopology({ VERCEL: '1' } as any),
        'MULTI_INSTANCE_RISK',
        'a serverless platform with no shared store must be reported as unsafe'
      );
      TestHarness.assertEqual(
        detectTopology({ AWS_LAMBDA_FUNCTION_NAME: 'fn' } as any),
        'MULTI_INSTANCE_RISK',
        'lambda must be detected too'
      );
      TestHarness.assertEqual(
        detectTopology({} as any),
        'SINGLE_INSTANCE',
        'a plain process with no platform markers is a single instance'
      );
    })
  );

  results.push(
    await TestHarness.runTest('Persistence', 'a real shared volume clears the risk', () => {
      TestHarness.assertEqual(
        detectTopology({ VERCEL: '1', AURA_SHARED_DATA_DIR: '/mnt/data' } as any),
        'SINGLE_INSTANCE',
        'a mounted network volume is the one serverless case that is genuinely shared'
      );
    })
  );

  results.push(
    await TestHarness.runTest('Persistence', 'an unsafe deployment is not ready until someone accepts it', () => {
      DependencyHealth.reset();
      const unsafe = reportPersistenceTopology({ VERCEL: '1' } as any);
      TestHarness.assertEqual(unsafe.safe, false, 'an unacknowledged multi-instance deployment must be unsafe');
      TestHarness.assertEqual(
        DependencyHealth.get('SharedPersistence')?.status,
        'DOWN',
        'the risk must be visible as a dependency failure, not a log line'
      );
      TestHarness.assertEqual(
        DependencyHealth.isSystemReady(),
        false,
        'readiness must refuse to route bookings to a deployment that can double-book'
      );
    })
  );

  results.push(
    await TestHarness.runTest('Persistence', 'acknowledging the risk downgrades it rather than hiding it', () => {
      DependencyHealth.reset();
      const accepted = reportPersistenceTopology({
        VERCEL: '1',
        AURA_ACK_MULTI_INSTANCE_PERSISTENCE: 'true',
      } as any);
      TestHarness.assertEqual(accepted.safe, true, 'an explicit acknowledgement must unblock routing');
      TestHarness.assertEqual(accepted.acknowledged, true, 'the acknowledgement must be recorded');
      TestHarness.assertEqual(
        DependencyHealth.get('SharedPersistence')?.status,
        'DEGRADED',
        'an acknowledged risk must stay visible as degraded, never reported healthy'
      );
    })
  );

  results.push(
    await TestHarness.runTest('Persistence', 'the strict flag refuses the acknowledgement', () => {
      // A deployment that genuinely must not double-book cannot be talked out of it by an
      // environment variable alone.
      DependencyHealth.reset();
      const strict = reportPersistenceTopology({
        VERCEL: '1',
        AURA_ACK_MULTI_INSTANCE_PERSISTENCE: 'true',
        AURA_REQUIRE_SHARED_STORE: 'true',
      } as any);
      TestHarness.assertEqual(strict.safe, false, 'strict mode must refuse an unsafe topology');
      TestHarness.assertEqual(DependencyHealth.get('SharedPersistence')?.status, 'DOWN', 'and report it as down');
    })
  );

  results.push(
    await TestHarness.runTest('Persistence', 'a single instance reports healthy, because it is', () => {
      DependencyHealth.reset();
      const single = reportPersistenceTopology({} as any);
      TestHarness.assertEqual(single.safe, true, 'a single instance is safe with a local journal');
      TestHarness.assertEqual(
        DependencyHealth.get('SharedPersistence')?.status,
        'HEALTHY',
        'the local journal is genuinely authoritative for one instance'
      );
    })
  );

  results.push(
    await TestHarness.runTest('Persistence', 'the requirements for a real backend are stated, not implied', () => {
      // A future adapter must implement atomicity, not just a method list. Assert the
      // documentation exists so it cannot be quietly deleted along with the module.
      TestHarness.assert(
        REQUIREMENTS_FOR_SHARED_PERSISTENCE.length >= 4,
        'the atomicity requirements must be documented'
      );
      TestHarness.assert(
        REQUIREMENTS_FOR_SHARED_PERSISTENCE.some((r) => /atomic/i.test(r)),
        'atomic read-modify-write must be an explicit requirement'
      );
    })
  );

  return results;
}
