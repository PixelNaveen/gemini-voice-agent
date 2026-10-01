import { TestHarness, TestResult } from '../TestHarness';
import { RecoveryManager } from '../../core/recovery/RecoveryManager';
import { ConnectionAuthority } from '../../core/connection/ConnectionAuthority';
import { AuraSessionManager } from '../../core/session/AuraSessionManager';
import { INDUSTRY_PRESETS } from '../../types';

export async function runRecoveryAuthorityTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const testPreset = INDUSTRY_PRESETS[0];

  // Test 1: Classifies failures correctly
  results.push(
    await TestHarness.runTest('RecoveryAuthority', 'Classifies intentional, terminal, and recoverable failures', () => {
      TestHarness.assertEqual(
        RecoveryManager.classifyFailure('WEBSOCKET', 'user_ended'),
        'INTENTIONAL',
        'user_ended should be INTENTIONAL'
      );
      TestHarness.assertEqual(
        RecoveryManager.classifyFailure('WEBSOCKET', 'Normal Closure', 1000),
        'INTENTIONAL',
        'Code 1000 should be INTENTIONAL'
      );
      TestHarness.assertEqual(
        RecoveryManager.classifyFailure('GEMINI', 'invalid_credential: API key expired'),
        'TERMINAL',
        'invalid_credential should be TERMINAL'
      );
      TestHarness.assertEqual(
        RecoveryManager.classifyFailure('GEMINI', 'resource_exhausted 429 quota reached'),
        'VALIDATED_RETRY',
        'quota/429 should be VALIDATED_RETRY'
      );
      TestHarness.assertEqual(
        RecoveryManager.classifyFailure('WEBSOCKET', 'WebSocket closed with code 1006'),
        'RECOVERABLE',
        'Code 1006 should be RECOVERABLE'
      );
    })
  );

  // Test 2: Deduplication: Multiple simultaneous failures collapse into ONE recovery operation
  results.push(
    await TestHarness.runTest('RecoveryAuthority', 'Deduplicates multiple failure reports into single recovery operation', () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      const conn = AuraSessionManager.createConnection(session, 1);
      AuraSessionManager.attachConnection(session, conn);
      AuraSessionManager.markConnected(session, conn.connectionId, 1);

      let reconnectTriggeredCount = 0;
      const authority = new RecoveryManager({
        authority: new ConnectionAuthority({ onLog: () => {} }),
        onLog: () => {},
        onReconnectInitiated: async () => {
          reconnectTriggeredCount++;
          return false;
        },
      });

      // 1. Report from Gemini
      const accepted1 = authority.reportFailure(session, 'GEMINI', 'Unexpected upstream drop');
      TestHarness.assert(accepted1, 'First failure report must be accepted');
      TestHarness.assertEqual(authority.getAttemptCount(), 1, 'Attempt count must be 1');

      // 2. Report from WebSocket arriving immediately after
      const accepted2 = authority.reportFailure(session, 'WEBSOCKET', 'Transport connection lost');
      TestHarness.assert(accepted2, 'Second failure report must attach to active recovery');
      TestHarness.assertEqual(authority.getAttemptCount(), 1, 'Attempt count must NOT double-increment');

      // 3. Report from Watchdog
      const accepted3 = authority.reportFailure(session, 'WATCHDOG', 'Silence timeout');
      TestHarness.assert(accepted3, 'Third failure report must attach to active recovery');
      TestHarness.assertEqual(authority.getAttemptCount(), 1, 'Attempt count must remain 1');

      const op = authority.getCurrentOperation();
      TestHarness.assert(Boolean(op), 'Active recovery operation must exist');
      TestHarness.assertEqual(op?.reports.length, 3, 'Must have recorded all 3 failure reports in the single operation context');

      authority.cancel();
    })
  );

  // Test 3: Intentional shutdown cancels recovery and prevents execution
  results.push(
    await TestHarness.runTest('RecoveryAuthority', 'Cancelling recovery stops scheduled execution', async () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      AuraSessionManager.markConnected(session, 'conn_1', 1);

      let reconnectExecuted = false;
      const authority = new RecoveryManager({
        authority: new ConnectionAuthority({ onLog: () => {} }),
        onLog: () => {},
        onReconnectInitiated: async () => {
          reconnectExecuted = true;
          return false;
        },
      });

      authority.reportFailure(session, 'GEMINI', 'Drop');
      TestHarness.assertEqual(authority.getState(), 'SCHEDULED', 'Recovery must be scheduled');

      // User ends call or switches persona
      authority.cancel('User clicked end');
      TestHarness.assertEqual(authority.getState(), 'CANCELLED', 'Recovery state must be CANCELLED');
      TestHarness.assert(authority.getCurrentOperation() === null, 'Active operation must be cleared');

      // Wait 15ms to verify timer does not trigger callback
      await new Promise((r) => setTimeout(r, 20));
      TestHarness.assert(!reconnectExecuted, 'Scheduled reconnect must NOT execute after cancellation');
    })
  );

  // Test 4: Terminal failure triggers immediate exhaustion
  results.push(
    await TestHarness.runTest('RecoveryAuthority', 'Terminal failure triggers immediate onRecoveryExhausted', () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      AuraSessionManager.markConnected(session, 'conn_1', 1);

      let exhaustedMessage = '';
      const authority = new RecoveryManager({
        onRecoveryExhausted: (_ctx, msg) => {
          exhaustedMessage = msg;
        },
      });

      const accepted = authority.reportFailure(session, 'GEMINI', 'unauthorized: invalid_credential');
      TestHarness.assert(!accepted, 'Terminal failure must not schedule a recovery');
      TestHarness.assertEqual(authority.getState(), 'EXHAUSTED', 'State must be EXHAUSTED');
      TestHarness.assert(exhaustedMessage.includes('Fatal terminal failure'), 'Must trigger exhaustion callback');
    })
  );

  // Test 5: RecoveryManager must never mint connection identity itself. The old standalone
  // path computed `generation + 1` from mutable session state, which is exactly how it used
  // to collide with a concurrently running GoAway renewal on the same generation.
  results.push(
    await TestHarness.runTest('RecoveryAuthority', 'Refuses to create a replacement without a Connection Authority', async () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      const conn = AuraSessionManager.createConnection(session, 1);
      AuraSessionManager.attachConnection(session, conn);
      AuraSessionManager.markConnected(session, conn.connectionId, 1);

      let reconnectExecuted = false;
      let exhaustedMessage = '';
      // No authority injected on purpose.
      const manager = new RecoveryManager({
        onLog: () => {},
        onReconnectInitiated: async () => {
          reconnectExecuted = true;
          return true;
        },
        onRecoveryExhausted: (_ctx, msg) => {
          exhaustedMessage = msg;
        },
      });

      manager.reportFailure(session, 'GEMINI', 'Transport connection lost');

      // Allow the backoff delay to elapse so the replacement would have been attempted.
      await new Promise((r) => setTimeout(r, 1600));

      TestHarness.assert(!reconnectExecuted, 'No replacement may be created without an authority');
      TestHarness.assertEqual(manager.getState(), 'EXHAUSTED', 'The manager must end rather than fabricate identity');
      TestHarness.assert(
        exhaustedMessage.includes('connection authority is not configured'),
        `The exhaustion reason must name the missing authority. Got: "${exhaustedMessage}"`
      );
    })
  );

  // Test 6: Cancelling a recovery must not abort a replacement owned by GoAway renewal.
  // The manager and the renewal manager share one Connection Authority, so an unconditional
  // abortInFlight() used to kill a healthy proactive renewal and leave the session with no
  // transport at all.
  results.push(
    await TestHarness.runTest('RecoveryAuthority', 'Cancelling a recovery does not abort a renewal-owned replacement', () => {
      const sharedAuthority = new ConnectionAuthority({ onLog: () => {} });
      const manager = new RecoveryManager({ authority: sharedAuthority, onLog: () => {} });

      // A renewal starts and owns the in-flight slot.
      let releaseRenewal: (v: boolean) => void = () => {};
      void sharedAuthority.requestReplacement('RENEWAL', () => new Promise<boolean>((res) => { releaseRenewal = res; }));
      const inflight = sharedAuthority.getInFlight();
      TestHarness.assertEqual(inflight?.purpose, 'RENEWAL', 'The renewal must own the in-flight slot');

      // The recovery manager cancels; it owns nothing.
      manager.cancel('User ended the call');

      TestHarness.assert(sharedAuthority.isInFlight(), 'A renewal-owned in-flight replacement must survive recovery cancel');
      TestHarness.assertEqual(sharedAuthority.getInFlight()?.connectionId, inflight?.connectionId, 'The in-flight ticket must be unchanged');

      // The renewal can still complete and be promoted.
      releaseRenewal(true);
    })
  );

  return results;
}
