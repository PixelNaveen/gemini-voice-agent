import { TestHarness, TestResult } from '../TestHarness';
import { GeminiWatchdog } from '../../core/watchdog/GeminiWatchdog';
import { RecoveryManager } from '../../core/recovery/RecoveryManager';
import { AuraSessionManager } from '../../core/session/AuraSessionManager';
import { INDUSTRY_PRESETS } from '../../types';
import { AuraSession } from '../../types';

/**
 * REGRESSION SUITE for the production false-positive recovery.
 *
 * The old watchdog declared the connection DEAD on `SPEAKING && no audio for 6000ms`.
 * A perfectly healthy connection trips that whenever the model finishes sending a long
 * turn while the client is still draining its local playback buffer. The observed failure
 * was a 7363 ms gap and a spurious reconnect that then tore down live calls.
 */
export async function runGeminiWatchdogTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const testPreset = INDUSTRY_PRESETS[0];

  const makeSession = (): AuraSession => {
    const session = AuraSessionManager.createSession(testPreset, 1);
    const conn = AuraSessionManager.createConnection(session, 1);
    AuraSessionManager.attachConnection(session, conn);
    AuraSessionManager.markConnected(session, conn.connectionId, 1);
    return session;
  };

  // Test 1: Normal caller silence with no open turn is not a fault.
  results.push(
    await TestHarness.runTest('GeminiWatchdog', 'Normal silence with no open turn stays HEALTHY', () => {
      const session = makeSession();
      const recoveryManager = new RecoveryManager({ onLog: () => {} });
      const watchdog = new GeminiWatchdog(session.sessionId, session.transport.connectionId, 1, recoveryManager, () => session);

      let t = 1_000_000;
      const wd = new GeminiWatchdog(
        session.sessionId,
        session.transport.connectionId,
        1,
        recoveryManager,
        () => session,
        { now: () => t, onLog: () => {} }
      );
      watchdog.stop();

      wd.setStage('LISTENING');
      // 10 minutes of total silence with no turn open.
      t += 600_000;
      const health = wd.evaluateHealth();

      TestHarness.assertEqual(health, 'HEALTHY', 'Silence with no open turn must remain HEALTHY');
      TestHarness.assertEqual(recoveryManager.getState(), 'NONE', 'No recovery may be triggered');
    })
  );

  // Test 2: A genuine stall with an open turn IS detected and reported.
  results.push(
    await TestHarness.runTest('GeminiWatchdog', 'Detects a real stall while a turn is open and reports to RecoveryAuthority', () => {
      const session = makeSession();
      const recoveryManager = new RecoveryManager({ onLog: () => {} });

      let t = 1_000_000;
      let reportedReason = '';
      const watchdog = new GeminiWatchdog(
        session.sessionId,
        session.transport.connectionId,
        1,
        recoveryManager,
        () => session,
        {
          now: () => t,
          stallTimeoutMs: 20_000,
          firstTokenTimeoutMs: 15_000,
          onLog: () => {},
          onFailureDetected: (reason) => {
            reportedReason = reason;
          },
        }
      );

      // Caller speaks; we open a turn and start waiting for the first model byte.
      watchdog.beginTurn('caller voice activity');
      t += 7_000;
      TestHarness.assertEqual(
        watchdog.evaluateHealth(),
        'HEALTHY',
        '7s of model thinking is well inside tolerance and must not fire'
      );

      t += 9_000; // 16s total, past firstTokenTimeout
      const health = watchdog.evaluateHealth();
      TestHarness.assertEqual(health, 'STALLED', 'Past the first-token budget with zero output must be STALLED');
      TestHarness.assert(reportedReason.length > 0, 'onFailureDetected must fire');
      TestHarness.assertEqual(recoveryManager.getState(), 'SCHEDULED', 'Recovery must be scheduled via RecoveryManager');

      // Repeated ticks for the same stall must not re-report.
      const reportsBefore = recoveryManager.getCurrentOperation()?.reports.length ?? 0;
      t += 2_000;
      watchdog.evaluateHealth();
      TestHarness.assertEqual(
        recoveryManager.getCurrentOperation()?.reports.length ?? 0,
        reportsBefore,
        'A persistent stall must be reported only once'
      );

      recoveryManager.cancel();
    })
  );

  // Test 3: THE REGRESSION. A long silence while draining the local playback buffer is
  // normal, not dead. This is the 7363 ms false positive that ended real calls.
  results.push(
    await TestHarness.runTest('GeminiWatchdog', 'Playback drain window suppresses the false-positive stall', () => {
      const session = makeSession();
      const recoveryManager = new RecoveryManager({ onLog: () => {} });

      let t = 1_000_000;
      const watchdog = new GeminiWatchdog(
        session.sessionId,
        session.transport.connectionId,
        1,
        recoveryManager,
        () => session,
        { now: () => t, stallTimeoutMs: 20_000, onLog: () => {} }
      );

      // Model streams a turn.
      watchdog.beginTurn('caller voice activity');
      watchdog.recordAudioReceived();
      for (let i = 0; i < 5; i++) {
        t += 500;
        watchdog.recordAudioReceived();
      }

      // Model stops producing; 12 chunks are still queued locally.
      watchdog.setPlaybackPending(12);
      watchdog.endTurn('model turn complete');
      TestHarness.assertEqual(
        watchdog.getStage(),
        'DRAINING_PLAYBACK',
        'Turn close with a non-empty queue must enter DRAINING_PLAYBACK'
      );

      // 7.4 seconds pass: the exact shape of the production false positive.
      t += 7_363;
      const health = watchdog.evaluateHealth();
      TestHarness.assertEqual(health, 'HEALTHY', 'Draining local playback must never be classified as a stall');
      TestHarness.assertEqual(recoveryManager.getState(), 'NONE', 'No recovery may be scheduled during playback drain');

      // Buffer finishes draining and the connection is still live.
      watchdog.setPlaybackPending(0);
      t += 1_000;
      TestHarness.assertEqual(watchdog.evaluateHealth(), 'HEALTHY', 'Connection remains healthy after drain completes');
      TestHarness.assertEqual(recoveryManager.getState(), 'NONE', 'Still no recovery');
    })
  );

  // Test 4: Timestamps are initialised to "now", never 0. A zero timestamp made the very
  // first evaluation see a ~55-year gap and declare the connection dead immediately.
  results.push(
    await TestHarness.runTest('GeminiWatchdog', 'Initial metrics timestamps are non-zero and health starts HEALTHY', () => {
      const session = makeSession();
      const recoveryManager = new RecoveryManager({ onLog: () => {} });
      const t = 1_700_000_000_000;
      const watchdog = new GeminiWatchdog(
        session.sessionId,
        session.transport.connectionId,
        1,
        recoveryManager,
        () => session,
        { now: () => t, onLog: () => {} }
      );

      const m = watchdog.getMetrics();
      TestHarness.assertEqual(m.lastProviderEventAt, t, 'lastProviderEventAt must start at now');
      TestHarness.assertEqual(m.lastAudioReceivedAt, t, 'lastAudioReceivedAt must start at now');
      TestHarness.assertEqual(m.lastTranscriptAt, t, 'lastTranscriptAt must start at now');
      TestHarness.assertEqual(m.lastOutboundAudioAt, t, 'lastOutboundAudioAt must start at now');
      TestHarness.assertEqual(watchdog.evaluateHealth(), 'HEALTHY', 'A brand new connection must start HEALTHY');
      TestHarness.assertEqual(recoveryManager.getState(), 'NONE', 'No recovery on a fresh connection');
    })
  );

  // Test 5: REGRESSION. Rebinding onto a new connection must NOT stop the watchdog.
  // The old implementation called stop() on a transient mismatch during handoff, which
  // left the watchdog permanently dead after the first recovery.
  results.push(
    await TestHarness.runTest('GeminiWatchdog', 'Rebinding to a new connection keeps the watchdog armed', () => {
      const session = makeSession();
      const recoveryManager = new RecoveryManager({ onLog: () => {} });
      const watchdog = new GeminiWatchdog(
        session.sessionId,
        session.transport.connectionId,
        1,
        recoveryManager,
        () => session,
        { onLog: () => {} }
      );
      watchdog.start();
      TestHarness.assert(watchdog.isActive(), 'Watchdog must be running');

      watchdog.updateConnection('conn_gen2', 2);
      TestHarness.assert(watchdog.isActive(), 'Watchdog must still be running after a rebind');
      TestHarness.assertEqual(watchdog.getMetrics().connectionId, 'conn_gen2', 'Must monitor the new connection');
      TestHarness.assertEqual(watchdog.getMetrics().connectionGeneration, 2, 'Must monitor the new generation');
      TestHarness.assertEqual(watchdog.getMetrics().rebindCount, 1, 'Rebind must be counted');

      // While still bound to the old ticket it reports DEGRADED, not DEAD, and does not
      // self-destruct or fire a failure.
      const health = watchdog.evaluateHealth();
      TestHarness.assertEqual(health, 'DEGRADED', 'A superseded ticket is DEGRADED, not DEAD');
      TestHarness.assertEqual(recoveryManager.getState(), 'NONE', 'Must not report a failure for a superseded ticket');
      TestHarness.assert(watchdog.isActive(), 'Watchdog must still be running after a DEGRADED evaluation');
      watchdog.stop();
    })
  );

  // Test 6: While recovery is in flight the watchdog must stay silent.
  results.push(
    await TestHarness.runTest('GeminiWatchdog', 'Stays silent while recovery is already in progress', () => {
      const session = makeSession();
      const recoveryManager = new RecoveryManager({ onLog: () => {} });
      let t = 1_000_000;
      const watchdog = new GeminiWatchdog(
        session.sessionId,
        session.transport.connectionId,
        1,
        recoveryManager,
        () => session,
        { now: () => t, stallTimeoutMs: 20_000, onLog: () => {} }
      );

      watchdog.beginTurn('caller voice activity');
      t += 60_000;
      session.status = 'RECOVERING';

      const health = watchdog.evaluateHealth();
      TestHarness.assertEqual(health, 'HEALTHY', 'Recovery in progress is a normal state, not a fault');
      TestHarness.assertEqual(recoveryManager.getState(), 'NONE', 'Must not stack a second recovery request');
    })
  );

  // Test 7: A stale watchdog bound to an ended session stops without a phantom failure.
  results.push(
    await TestHarness.runTest('GeminiWatchdog', 'Ignores an ended session without firing phantom failures', () => {
      const session = makeSession();
      AuraSessionManager.endSession(session, 'USER_ENDED');
      const recoveryManager = new RecoveryManager({ onLog: () => {} });
      const watchdog = new GeminiWatchdog(
        session.sessionId,
        'conn_old',
        1,
        recoveryManager,
        () => session,
        { onLog: () => {} }
      );

      const health = watchdog.evaluateHealth();
      TestHarness.assertEqual(health, 'DEAD', 'An ended session must evaluate as DEAD');
      TestHarness.assertEqual(recoveryManager.getState(), 'NONE', 'Must not trigger recovery on an ended session');
      TestHarness.assert(!watchdog.isActive(), 'Watchdog must stop itself on an ended session');
    })
  );

  return results;
}
