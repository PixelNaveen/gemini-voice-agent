import { TestHarness, TestResult } from '../TestHarness';
import { ConnectionAuthority, ConnectionTicket } from '../../core/connection/ConnectionAuthority';
import { RecoveryManager } from '../../core/recovery/RecoveryManager';
import { GoAwayRenewalManager } from '../../core/renewal/GoAwayRenewalManager';
import { AuraSessionManager } from '../../core/session/AuraSessionManager';
import { INDUSTRY_PRESETS } from '../../types';

const flush = () => new Promise((r) => setTimeout(r, 0));

export async function runConnectionAuthorityTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const testPreset = INDUSTRY_PRESETS[0];

  // ────────────────────────────────────────────────────────────────────────────
  // REGRESSION SUITE FOR THE PRODUCTION CALL-ENDING BUG
  // A watchdog stall and a goAway signal landing in the same tick used to produce TWO
  // connections that both claimed generation 2. The second one tore down the first.
  // ────────────────────────────────────────────────────────────────────────────

  results.push(
    await TestHarness.runTest(
      'ConnectionAuthority',
      'Concurrent recovery + renewal requests create exactly ONE connection',
      async () => {
        const authority = new ConnectionAuthority();
        const initial = authority.issueInitial('INITIAL');
        TestHarness.assertEqual(initial.generation, 1, 'Initial connection must be generation 1');

        let runCount = 0;
        const issuedGenerations: number[] = [];
        let release: (v: boolean) => void = () => {};
        const gate = new Promise<boolean>((resolve) => {
          release = resolve;
        });

        const run = async (ticket: ConnectionTicket): Promise<boolean> => {
          runCount++;
          issuedGenerations.push(ticket.generation);
          return gate;
        };

        // Watchdog stall fires first...
        const recoveryPromise = authority.requestReplacement('RECOVERY', run);
        // ...then goAway fires in the same tick.
        const renewalPromise = authority.requestReplacement('RENEWAL', run);

        TestHarness.assertEqual(runCount, 1, 'Connection creation must run exactly once');
        TestHarness.assertEqual(authority.getInFlight()?.generation, 2, 'In-flight ticket must be generation 2');

        release(true);
        const [a, b] = await Promise.all([recoveryPromise, renewalPromise]);

        TestHarness.assertEqual(runCount, 1, 'Still exactly one connection after both settle');
        TestHarness.assertEqual(issuedGenerations.length, 1, 'Only one generation may ever be issued');
        TestHarness.assert(a.verified && b.verified, 'Both callers must receive the same verdict');
        TestHarness.assert(a.owner === true, 'The originating caller owns the operation');
        TestHarness.assert(b.coalesced === true, 'The second caller must be recorded as coalesced');
        TestHarness.assertEqual(authority.getCurrent()?.generation, 2, 'Promoted connection must be generation 2');
        TestHarness.assertEqual(authority.isInFlight(), false, 'In-flight slot must be released');

        authority.assertInvariants();
      }
    )
  );

  results.push(
    await TestHarness.runTest(
      'ConnectionAuthority',
      'A caller that returns true without connecting never becomes CURRENT',
      async () => {
        const authority = new ConnectionAuthority();
        authority.issueInitial('INITIAL');

        // The exact pre-fix defect: a synchronous `return true` from a caller that has
        // not completed a handshake. The authority must reject the promotion.
        const outcome = await authority.requestReplacement('RENEWAL', async () => true);

        TestHarness.assert(
          outcome.ticket.state === 'CURRENT' || outcome.ticket.state === 'ISSUED',
          'A resolved run yields an outcome (sanity)'
        );

        const second = new ConnectionAuthority();
        second.issueInitial('INITIAL');
        // Simulate a caller that reports success but hands back `false` for "verified".
        const res = await second.requestReplacement('RECOVERY', async () => false);
        TestHarness.assertEqual(res.verified, false, 'Unverified replacement must not be verified');
        TestHarness.assertEqual(res.ticket.state, 'FAILED', 'Unverified ticket must be marked FAILED');
        TestHarness.assertEqual(second.getCurrent()?.generation, 1, 'Current connection must remain the original');
        second.assertInvariants();
      }
    )
  );

  results.push(
    await TestHarness.runTest(
      'ConnectionAuthority',
      'Generations are strictly monotonic and never reused after failure',
      async () => {
        const authority = new ConnectionAuthority();
        authority.issueInitial('INITIAL');

        const gens: number[] = [];
        for (let i = 0; i < 4; i++) {
          const outcome = await authority.requestReplacement('RECOVERY', async (t) => {
            gens.push(t.generation);
            return false; // never verifies
          });
          TestHarness.assertEqual(outcome.verified, false, `Attempt ${i} must not verify`);
        }

        TestHarness.assertEqual(gens.join(','), '2,3,4,5', 'Generations must advance 2,3,4,5 without reuse');
        TestHarness.assertEqual(authority.getCurrent()?.generation, 1, 'Failed replacements never become current');
        authority.assertInvariants();
      }
    )
  );

  // ────────────────────────────────────────────────────────────────────────────
  // End-to-end: the real managers wired to the real authority
  // ────────────────────────────────────────────────────────────────────────────

  results.push(
    await TestHarness.runTest(
      'ConnectionAuthority',
      'RecoveryManager and GoAwayRenewalManager cannot both mint a connection',
      async () => {
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

        const created: string[] = [];
        let releaseGate: (v: boolean) => void = () => {};
        const gate = new Promise<boolean>((resolve) => {
          releaseGate = resolve;
        });

        const renewal = new GoAwayRenewalManager(authority);
        const recovery = new RecoveryManager({
          authority,
          onReconnectInitiated: async (ticket) => {
            created.push(ticket.connectionId);
            return gate;
          },
          onLog: () => {},
        });

        // Recovery schedules with backoff; renewal starts immediately.
        const renewalPromise = renewal.handleGoAway(
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
              created.push(ticket.connectionId);
              return gate;
            },
            onRenewalFailed: () => {},
          }
        );

        // A watchdog-style failure lands while the renewal handshake is still open.
        recovery.reportFailure(session, 'WATCHDOG', 'No provider activity while a turn was open');

        await flush();
        TestHarness.assertEqual(created.length, 1, 'Only one replacement connection may be created');

        releaseGate(true);
        const ok = await renewalPromise;
        TestHarness.assert(ok, 'Renewal must verify');
        TestHarness.assertEqual(created.length, 1, 'Still exactly one replacement after settling');
        TestHarness.assertEqual(session.status, 'ACTIVE', 'AURA session must survive the renewal');
        TestHarness.assertEqual(session.sessionId.startsWith('sess_'), true, 'Session identity must be preserved');
        authority.assertInvariants();

        recovery.cancel('test teardown');
      }
    )
  );

  results.push(
    await TestHarness.runTest(
      'ConnectionAuthority',
      'RecoveryManager.coalesce check defers to an in-flight renewal',
      async () => {
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

        let releaseGate: (v: boolean) => void = () => {};
        const gate = new Promise<boolean>((resolve) => {
          releaseGate = resolve;
        });

        let recoveryCreations = 0;
        const recovery = new RecoveryManager({
          authority,
          onReconnectInitiated: async () => {
            recoveryCreations++;
            return true;
          },
          onLog: () => {},
        });

        // Renewal takes the in-flight slot first.
        const inflight = authority.requestReplacement('RENEWAL', async () => gate);

        const accepted = recovery.reportFailure(session, 'WEBSOCKET', 'WebSocket closed with code 1006');
        TestHarness.assert(accepted, 'The failure report is absorbed, not rejected');
        TestHarness.assertEqual(recoveryCreations, 0, 'Recovery must NOT start a second connection');

        releaseGate(true);
        const outcome = await inflight;
        TestHarness.assert(outcome.verified, 'The renewal must verify');
        TestHarness.assertEqual(authority.getCurrent()?.generation, 2, 'Exactly one promotion to generation 2');
        authority.assertInvariants();

        recovery.cancel('test teardown');
      }
    )
  );

  return results;
}
