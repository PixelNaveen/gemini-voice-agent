import { TestHarness, TestResult } from '../TestHarness';
import { ConnectionGuard } from '../../core/recovery/ConnectionGuard';
import { SessionGuard } from '../../core/session/SessionGuard';
import { AuraSessionManager } from '../../core/session/AuraSessionManager';
import { ActiveSession, SessionContext } from '../../types';

export async function runSessionGuardTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Active session matches exact context
  results.push(
    await TestHarness.runTest('SessionGuard', 'Validates active session matching current context', () => {
      const activeCtx: SessionContext = {
        sessionId: 'sess_123',
        personaId: 'aura-salon',
        createdAt: Date.now(),
        status: 'CONNECTED',
        generation: 1,
      };

      const mockSession: ActiveSession = {
        context: activeCtx,
        sessionId: activeCtx.sessionId,
        personaId: activeCtx.personaId,
        status: activeCtx.status,
        persona: {} as any,
        transport: {
          status: 'CONNECTED',
          connectionId: 'conn_1',
          connectionGeneration: 1,
          reconnectAttempt: 0,
          recoveryStatus: 'SUCCEEDED',
          closeReason: 'SESSION_END',
          lastConnectedAt: Date.now(),
          lastDisconnectedAt: null,
        },
        audio: {} as any,
        greeting: 'COMPLETED',
        memory: {} as any,
        runtimeState: {} as any,
      };

      const isValid = SessionGuard.isActive(activeCtx, mockSession);
      TestHarness.assert(isValid, 'Session should be active when context matches');
    })
  );

  // Test 2: Rejects stale generation from previous session
  results.push(
    await TestHarness.runTest('SessionGuard', 'Rejects stale async generation', () => {
      const isCurrent = ConnectionGuard.isCurrent(
        'sess_123',
        2, // current generation
        'conn_2',
        'sess_123',
        1, // stale generation
        'conn_1'
      );
      TestHarness.assert(!isCurrent, 'ConnectionGuard must reject older connection generations');
    })
  );

  // Test 3: Rejects mismatched session ID
  results.push(
    await TestHarness.runTest('SessionGuard', 'Rejects mismatched session ID', () => {
      const isCurrent = ConnectionGuard.isCurrent(
        'sess_active_999',
        1,
        'conn_1',
        'sess_old_111',
        1,
        'conn_1'
      );
      TestHarness.assert(!isCurrent, 'ConnectionGuard must reject cross-session event');
    })
  );

  // Test 4 (Section 03): Authoritative State Machine Transitions
  results.push(
    await TestHarness.runTest('AuraSessionManager', 'Validates legal and illegal transitions', () => {
      const session = AuraSessionManager.createSession({ id: 'test_persona', businessName: 'Test' } as any, 1);

      // Legal: STARTING -> ACTIVE via START_SUCCESS
      const startOk = AuraSessionManager.transition(session, 'START_SUCCESS', 'Handshake ok');
      TestHarness.assert(startOk, 'START_SUCCESS should transition STARTING to ACTIVE');
      TestHarness.assertEqual(session.status, 'ACTIVE', 'Status should be ACTIVE');

      // Legal: ACTIVE -> RECOVERING via GEMINI_FAILURE
      const failOk = AuraSessionManager.transition(session, 'GEMINI_FAILURE', 'Socket closed');
      TestHarness.assert(failOk, 'GEMINI_FAILURE should transition ACTIVE to RECOVERING');
      TestHarness.assertEqual(session.status, 'RECOVERING', 'Status should be RECOVERING');

      // Legal: RECOVERING -> ACTIVE via RECOVERY_SUCCESS
      const recOk = AuraSessionManager.transition(session, 'RECOVERY_SUCCESS', 'Reconnected');
      TestHarness.assert(recOk, 'RECOVERY_SUCCESS should transition RECOVERING to ACTIVE');
      TestHarness.assertEqual(session.status, 'ACTIVE', 'Status should be ACTIVE');

      // Legal: ACTIVE -> ENDING -> ENDED
      AuraSessionManager.transition(session, 'USER_END', 'User clicked end');
      TestHarness.assertEqual(session.status, 'ENDING', 'Status should be ENDING');
      AuraSessionManager.transition(session, 'END_COMPLETE', 'Teardown complete');
      TestHarness.assertEqual(session.status, 'ENDED', 'Status should be ENDED');

      // ILLEGAL: ENDED -> ENDING must be rejected!
      const illegalEndedToEnding = AuraSessionManager.transition(session, 'USER_END', 'Repeat end');
      TestHarness.assert(!illegalEndedToEnding, 'ENDED -> ENDING transition must be rejected');

      // ILLEGAL: ENDED -> ACTIVE must be rejected!
      const illegalEndedToActive = AuraSessionManager.transition(session, 'START_SUCCESS', 'Stale callback');
      TestHarness.assert(!illegalEndedToActive, 'ENDED -> ACTIVE transition must be rejected');
    })
  );

  // Test 5 (Section 04): Idempotent Shutdown Execution
  results.push(
    await TestHarness.runTest('AuraSessionManager', 'Idempotent executeEnd executes cleanup once for parallel calls', async () => {
      const session = AuraSessionManager.createSession({ id: 'test_persona', businessName: 'Test' } as any, 1);
      AuraSessionManager.transition(session, 'START_SUCCESS', 'Active');

      let cleanupExecutionCount = 0;
      const endPromise1 = AuraSessionManager.executeEnd(session, 'USER_ENDED', async () => {
        cleanupExecutionCount++;
        await new Promise((r) => setTimeout(r, 10));
      });
      const endPromise2 = AuraSessionManager.executeEnd(session, 'USER_ENDED', async () => {
        cleanupExecutionCount++;
      });
      const endPromise3 = AuraSessionManager.executeEnd(session, 'NETWORK_FAILURE', async () => {
        cleanupExecutionCount++;
      });

      await Promise.all([endPromise1, endPromise2, endPromise3]);

      TestHarness.assertEqual(cleanupExecutionCount, 1, 'Cleanup function must only execute exactly ONCE across parallel calls');
    })
  );

  return results;
}
