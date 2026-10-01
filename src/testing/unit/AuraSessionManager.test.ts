import { TestHarness, TestResult } from '../TestHarness';
import { AuraSessionManager } from '../../core/session/AuraSessionManager';
import { INDUSTRY_PRESETS } from '../../types';

export async function runAuraSessionManagerTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const testPreset = INDUSTRY_PRESETS[0];

  // Test 1: Start creates session in STARTING state
  results.push(
    await TestHarness.runTest('AuraSessionManager', 'Creates session in STARTING state with valid metadata', () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      TestHarness.assertEqual(session.status, 'STARTING', 'Status should be STARTING');
      TestHarness.assertEqual(session.personaId, testPreset.id, 'Persona ID must match preset');
      TestHarness.assert(session.sessionId.startsWith('sess_'), 'Session ID must start with sess_');
      TestHarness.assertEqual(session.lifecycle?.transitionHistory.length, 1, 'Lifecycle history should have 1 entry');
    })
  );

  // Test 2: START_SUCCESS moves to ACTIVE
  results.push(
    await TestHarness.runTest('AuraSessionManager', 'START_SUCCESS transitions STARTING -> ACTIVE', () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      const conn = AuraSessionManager.createConnection(session, 1);
      AuraSessionManager.attachConnection(session, conn);

      const success = AuraSessionManager.markConnected(session, conn.connectionId, 1);
      TestHarness.assert(success.status === 'CONNECTED' || success.status === 'ACTIVE', 'Session must be ACTIVE/CONNECTED');
      TestHarness.assertEqual(session.transport.status, 'CONNECTED', 'Transport must be CONNECTED');
    })
  );

  // Test 3: Rejects illegal ENDED -> ENDING
  results.push(
    await TestHarness.runTest('AuraSessionManager', 'Rejects illegal ENDED -> ENDING transition', () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      AuraSessionManager.endSession(session, 'USER_ENDED');
      TestHarness.assertEqual(session.status, 'ENDED', 'Session must be ENDED');

      // Attempting USER_END while ENDED must be rejected
      const transitionResult = AuraSessionManager.transition(session, 'USER_END', 'Stale end request');
      TestHarness.assert(!transitionResult, 'AuraSessionManager must reject USER_END when already in ENDED state');
      TestHarness.assertEqual(session.status, 'ENDED', 'Status must remain ENDED');
    })
  );

  // Test 4: Rejects illegal CLOSED -> CLOSING on transport
  results.push(
    await TestHarness.runTest('AuraSessionManager', 'Rejects illegal CLOSED -> CLOSING transport transition', () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      AuraSessionManager.endSession(session, 'USER_ENDED');
      TestHarness.assertEqual(session.transport.status, 'CLOSED', 'Transport must be CLOSED');

      const transitionResult = AuraSessionManager.transitionTransport(session, 'CLOSE_REQUEST', 'Duplicate close request');
      TestHarness.assert(!transitionResult, 'Transport must reject CLOSE_REQUEST when already CLOSED');
      TestHarness.assertEqual(session.transport.status, 'CLOSED', 'Transport status must remain CLOSED');
    })
  );

  // Test 5: GEMINI_FAILURE moves ACTIVE -> RECOVERING (Preserves AURA session)
  results.push(
    await TestHarness.runTest('AuraSessionManager', 'GEMINI_FAILURE transitions ACTIVE -> RECOVERING without killing session', () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      const conn = AuraSessionManager.createConnection(session, 1);
      AuraSessionManager.attachConnection(session, conn);
      AuraSessionManager.markConnected(session, conn.connectionId, 1);

      // Simulate unexpected upstream failure
      AuraSessionManager.handleConnectionFailure(session, conn.connectionId, 'Gemini connection dropped');

      TestHarness.assert(session.status === 'RECOVERING' || session.status === 'RECONNECTING', 'Session must be in RECOVERING state');
      TestHarness.assertEqual(session.transport.status, 'CLOSED', 'Gemini transport must be marked CLOSED');
      TestHarness.assert(AuraSessionManager.canRecover(session), 'Session must be eligible for recovery');
      TestHarness.assert(AuraSessionManager.isSessionActive(session), 'Session is still active (not ended)');
    })
  );

  // Test 6: RECOVERY_SUCCESS moves RECOVERING -> ACTIVE
  results.push(
    await TestHarness.runTest('AuraSessionManager', 'RECOVERY_SUCCESS transitions RECOVERING -> ACTIVE', () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      const conn1 = AuraSessionManager.createConnection(session, 1);
      AuraSessionManager.attachConnection(session, conn1);
      AuraSessionManager.markConnected(session, conn1.connectionId, 1);

      // Connection dropped
      AuraSessionManager.handleConnectionFailure(session, conn1.connectionId, 'Drop');

      // New replacement connection established
      const conn2 = AuraSessionManager.createConnection(session, 2);
      AuraSessionManager.attachConnection(session, conn2);
      AuraSessionManager.handleRecoverySuccess(session, conn2.connectionId, 2);

      TestHarness.assert(session.status === 'ACTIVE' || session.status === 'CONNECTED', 'Session must return to ACTIVE');
      TestHarness.assertEqual(session.transport.status, 'CONNECTED', 'Transport must be CONNECTED');
      TestHarness.assertEqual(session.transport.connectionId, conn2.connectionId, 'Active connection ID must be updated');
    })
  );

  return results;
}
