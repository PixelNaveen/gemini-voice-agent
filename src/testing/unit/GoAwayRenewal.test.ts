import { TestHarness, TestResult } from '../TestHarness';
import { GoAwayRenewalManager } from '../../core/renewal/GoAwayRenewalManager';
import { ConnectionAuthority } from '../../core/connection/ConnectionAuthority';
import { AuraSessionManager } from '../../core/session/AuraSessionManager';
import { INDUSTRY_PRESETS } from '../../types';

export async function runGoAwayRenewalTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const testPreset = INDUSTRY_PRESETS[0];

  // Test 1: GoAway triggers proactive renewal without terminating the AURA session.
  // The replacement is only reported as verified after the transport confirms it.
  results.push(
    await TestHarness.runTest('GoAwayRenewal', 'Proactively initiates and verifies replacement while preserving AURA session', async () => {
      const authority = new ConnectionAuthority();
      const session = AuraSessionManager.createSession(testPreset, 1);
      const conn1 = AuraSessionManager.createConnection(
        session,
        1,
        'Kore',
        undefined,
        authority.issueInitial('INITIAL').connectionId
      );
      AuraSessionManager.attachConnection(session, conn1);
      AuraSessionManager.markConnected(session, conn1.connectionId, 1);

      let replacementInitiated = false;
      let replacementVerified = false;
      const renewalManager = new GoAwayRenewalManager(authority);

      const success = await renewalManager.handleGoAway(
        {
          auraSessionId: session.sessionId,
          connectionId: conn1.connectionId,
          connectionGeneration: 1,
          timeRemaining: '10s',
          timestamp: Date.now(),
        },
        session,
        {
          onInitiateReplacement: async (ticket) => {
            replacementInitiated = true;
            TestHarness.assertEqual(ticket.generation, 2, 'Replacement generation must increment to 2');
            TestHarness.assert(ticket.connectionId.startsWith('conn_'), 'New connection ID must be generated');
            TestHarness.assert(ticket.connectionId !== conn1.connectionId, 'Replacement must be a distinct connection');
            return true;
          },
          onReplacementVerified: (_ctx, oldId) => {
            replacementVerified = true;
            TestHarness.assertEqual(oldId, conn1.connectionId, 'Old connection ID must match');
          },
          onRenewalFailed: () => {},
        }
      );

      TestHarness.assert(success, 'Renewal must succeed');
      TestHarness.assert(replacementInitiated, 'Replacement must be initiated');
      TestHarness.assert(replacementVerified, 'Replacement must be verified');
      TestHarness.assertEqual(session.status, 'ACTIVE', 'AURA Session must remain ACTIVE throughout renewal');
      TestHarness.assertEqual(session.sessionId.startsWith('sess_'), true, 'Session ID must remain unchanged');
      TestHarness.assertEqual(authority.getCurrent()?.generation, 2, 'Authority must promote generation 2');
      authority.assertInvariants();
    })
  );

  // Test 2: A replacement that never actually connects must NOT be reported as a success.
  // This is the exact pre-fix behaviour: returning true synchronously from a caller that
  // had not connected caused a false-positive swap and a dropped call.
  results.push(
    await TestHarness.runTest('GoAwayRenewal', 'Unverified replacement is reported as failed, never as success', async () => {
      const authority = new ConnectionAuthority();
      const session = AuraSessionManager.createSession(testPreset, 1);
      const conn1 = AuraSessionManager.createConnection(
        session,
        1,
        'Kore',
        undefined,
        authority.issueInitial('INITIAL').connectionId
      );
      AuraSessionManager.attachConnection(session, conn1);
      AuraSessionManager.markConnected(session, conn1.connectionId, 1);

      const renewalManager = new GoAwayRenewalManager(authority);
      let verified = false;
      let failureReported = '';

      const success = await renewalManager.handleGoAway(
        {
          auraSessionId: session.sessionId,
          connectionId: conn1.connectionId,
          connectionGeneration: 1,
          timestamp: Date.now(),
        },
        session,
        {
          // The handshake never completes.
          onInitiateReplacement: async () => false,
          onReplacementVerified: () => {
            verified = true;
          },
          onRenewalFailed: (_ctx, err) => {
            failureReported = err;
          },
        }
      );

      TestHarness.assert(!success, 'Renewal must NOT report success without verification');
      TestHarness.assert(!verified, 'onReplacementVerified must not fire');
      TestHarness.assert(failureReported.length > 0, 'onRenewalFailed must fire with a reason');
      TestHarness.assertEqual(authority.getCurrent()?.generation, 1, 'Original connection must remain current');
      TestHarness.assertEqual(session.status, 'ACTIVE', 'Session must remain alive after a failed renewal');
      authority.assertInvariants();
    })
  );

  // Test 3: Rejects a stale GoAway event from an obsolete connection.
  results.push(
    await TestHarness.runTest('GoAwayRenewal', 'Rejects stale GoAway event from superseded connection', async () => {
      const authority = new ConnectionAuthority();
      const session = AuraSessionManager.createSession(testPreset, 1);
      const conn2 = AuraSessionManager.createConnection(
        session,
        2,
        'Kore',
        undefined,
        authority.issueInitial('INITIAL').connectionId
      );
      AuraSessionManager.attachConnection(session, conn2);

      const renewalManager = new GoAwayRenewalManager(authority);
      let replacementInitiated = false;

      // A delayed goAway arrives for an obsolete connection.
      const success = await renewalManager.handleGoAway(
        {
          auraSessionId: session.sessionId,
          connectionId: 'conn_obsolete_1',
          connectionGeneration: 1,
          timestamp: Date.now(),
        },
        session,
        {
          onInitiateReplacement: async () => {
            replacementInitiated = true;
            return true;
          },
          onRenewalFailed: () => {},
        }
      );

      TestHarness.assert(!success, 'Stale GoAway must be rejected');
      TestHarness.assert(!replacementInitiated, 'Replacement must not be triggered for stale connection');
    })
  );

  // Test 4: A goAway arriving for a session that is already ending must be ignored.
  results.push(
    await TestHarness.runTest('GoAwayRenewal', 'Ignores GoAway once the session is ending', async () => {
      const authority = new ConnectionAuthority();
      const session = AuraSessionManager.createSession(testPreset, 1);
      const conn1 = AuraSessionManager.createConnection(
        session,
        1,
        'Kore',
        undefined,
        authority.issueInitial('INITIAL').connectionId
      );
      AuraSessionManager.attachConnection(session, conn1);
      AuraSessionManager.markConnected(session, conn1.connectionId, 1);
      session.status = 'ENDING';

      const renewalManager = new GoAwayRenewalManager(authority);
      let replacementInitiated = false;

      const success = await renewalManager.handleGoAway(
        {
          auraSessionId: session.sessionId,
          connectionId: conn1.connectionId,
          connectionGeneration: 1,
          timestamp: Date.now(),
        },
        session,
        {
          onInitiateReplacement: async () => {
            replacementInitiated = true;
            return true;
          },
          onRenewalFailed: () => {},
        }
      );

      TestHarness.assert(!success, 'GoAway must be ignored for an ending session');
      TestHarness.assert(!replacementInitiated, 'No replacement may be started during shutdown');
    })
  );

  return results;
}
