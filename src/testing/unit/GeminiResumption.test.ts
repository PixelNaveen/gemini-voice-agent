import { TestHarness, TestResult } from '../TestHarness';
import { AuraSessionManager } from '../../core/session/AuraSessionManager';
import { RecoveryManager } from '../../core/recovery/RecoveryManager';
import { ConnectionAuthority } from '../../core/connection/ConnectionAuthority';
import { ConnectionGuard } from '../../core/recovery/ConnectionGuard';
import { ContextBuilder } from '../../core/memory/ContextBuilder';
import { MemoryManager } from '../../core/memory/MemoryManager';
import { TranscriptStore } from '../../core/memory/TranscriptStore';
import { INITIAL_CONVERSATION_STATE } from '../../core/conversation/ConversationState';
import { INDUSTRY_PRESETS } from '../../types';
import { PromptAuthority } from '../../server/prompt/PromptAuthority';

export async function runGeminiResumptionTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const testPreset = INDUSTRY_PRESETS[0];

  // Test 1: Resumption state initialization & update
  results.push(
    await TestHarness.runTest('GeminiResumption', 'Initializes and updates provider-side resumption metadata', () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      const conn = AuraSessionManager.createConnection(session, 1);
      AuraSessionManager.attachConnection(session, conn);

      TestHarness.assert(Boolean(session.transport.resumption), 'Transport must have resumption state initialized');
      TestHarness.assertEqual(session.transport.resumption?.resumable, false, 'Initial resumable must be false');
      TestHarness.assertEqual(session.transport.resumption?.handle, null, 'Initial handle must be null');

      // Receive provider resumption token update
      const mockHandle = 'token_gemini_resume_abc123';
      AuraSessionManager.updateResumptionState(session, conn.connectionId, mockHandle, true);

      TestHarness.assertEqual(session.transport.resumption?.handle, mockHandle, 'Resumption handle must be stored');
      TestHarness.assertEqual(session.transport.resumption?.resumable, true, 'Resumable flag must be true');
      TestHarness.assert(
        Boolean(session.transport.resumption?.expiresAt && session.transport.resumption.expiresAt > Date.now()),
        'ExpiresAt must be in future'
      );
    })
  );

  // Test 2: Resumption eligibility verification
  results.push(
    await TestHarness.runTest('GeminiResumption', 'Verifies resumption eligibility against expiration and resumable state', () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      const conn = AuraSessionManager.createConnection(session, 1);
      AuraSessionManager.attachConnection(session, conn);

      // Not eligible when handle is null
      TestHarness.assertEqual(AuraSessionManager.isResumptionEligible(session), false, 'Must not be eligible with null handle');

      // Eligible when valid token is present and resumable=true
      AuraSessionManager.updateResumptionState(session, conn.connectionId, 'token_xyz', true);
      TestHarness.assertEqual(AuraSessionManager.isResumptionEligible(session), true, 'Must be eligible with valid handle');

      // Ineligible when resumable=false (e.g. during tool execution or generating)
      AuraSessionManager.updateResumptionState(session, conn.connectionId, null, false);
      TestHarness.assertEqual(AuraSessionManager.isResumptionEligible(session), false, 'Must not be eligible when resumable=false');

      // Ineligible when expired
      if (session.transport.resumption) {
        session.transport.resumption.resumable = true;
        session.transport.resumption.handle = 'token_expired';
        session.transport.resumption.expiresAt = Date.now() - 1000; // expired
      }
      TestHarness.assertEqual(AuraSessionManager.isResumptionEligible(session), false, 'Must not be eligible when expired');
    })
  );

  // Test 3: Session Continuity across Gemini Failure
  results.push(
    await TestHarness.runTest('GeminiResumption', 'AURA Session ID, persona, and memory survive Gemini recovery', () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      const originalSessionId = session.sessionId;
      const conn1 = AuraSessionManager.createConnection(session, 1);
      AuraSessionManager.attachConnection(session, conn1);
      AuraSessionManager.markConnected(session, conn1.connectionId, 1);

      // Add conversation memory and state
      session.memory.facts.push({
        id: 'fact_1',
        category: 'fact',
        content: 'Sarah Connor',
        timestamp: new Date().toISOString(),
      });
      session.runtimeState.intent = 'BOOKING';
      session.runtimeState.state = 'SELECTING_SLOT';

      // Gemini connection fails
      AuraSessionManager.handleConnectionFailure(session, conn1.connectionId, 'Gemini connection lost');

      // INVARIANT: AURA session is RECOVERING, NOT ENDED
      TestHarness.assert(session.status === 'RECOVERING' || session.status === 'RECONNECTING', 'Session must be RECOVERING');
      TestHarness.assertEqual(session.sessionId, originalSessionId, 'Session ID must remain identical');
      TestHarness.assertEqual(session.personaId, testPreset.id, 'Persona ID must remain identical');
      TestHarness.assertEqual(session.memory.facts.length, 1, 'Memory facts must be completely preserved');
      TestHarness.assertEqual(session.runtimeState.state, 'SELECTING_SLOT', 'Conversation runtime stage must be preserved');

      // Replacement connection succeeds
      const conn2 = AuraSessionManager.createConnection(session, 2);
      AuraSessionManager.attachConnection(session, conn2);
      AuraSessionManager.handleRecoverySuccess(session, conn2.connectionId, 2);

      TestHarness.assert(session.status === 'ACTIVE' || session.status === 'CONNECTED', 'Session must return to ACTIVE');
      TestHarness.assertEqual(session.sessionId, originalSessionId, 'Session ID must still be identical');
      TestHarness.assertEqual(session.transport.connectionId, conn2.connectionId, 'Active connection ID must be updated');
    })
  );

  // Test 4: the recovery directive must exist in the prompt that actually reaches the model.
  //
  // This test used to assert the directive was present in `ContextBuilder`'s
  // `systemInstruction`. That field was never transmitted - the server composes the
  // authoritative instruction and ignores the client's - so the assertion was proving that a
  // recovery rule existed in dead code, which is not the same as the model receiving it. The
  // assertion now targets `PromptAuthority`, which is what the provider is given.
  results.push(
    await TestHarness.runTest('GeminiResumption', 'Recovery continuation reaches the model through the server prompt authority', () => {
      const memoryManager = new MemoryManager('sess_test_1', testPreset.id);
      const transcriptStore = new TranscriptStore('sess_test_1', testPreset.id);
      memoryManager.addSessionFact('Sarah', 'fact', 'USER');

      const runtimeState = {
        ...INITIAL_CONVERSATION_STATE,
        intent: 'BOOKING' as const,
        state: 'SELECTING_SLOT' as const,
      };

      // Normal call start
      const normal = PromptAuthority.assemble({
        personaId: testPreset.id,
        sessionId: 'sess_test_1',
        connectionId: 'conn_1',
        isRecovery: false,
      });
      TestHarness.assert(
        !normal.systemInstruction.includes('RECOVERY CONTINUATION'),
        'A new call must not carry the recovery directive'
      );

      // Recovery reconnect
      const recovery = PromptAuthority.assemble({
        personaId: testPreset.id,
        sessionId: 'sess_test_1',
        connectionId: 'conn_2',
        isRecovery: true,
      });
      TestHarness.assert(
        recovery.systemInstruction.includes('RECOVERY CONTINUATION'),
        'A reconnect must include the recovery continuation directive'
      );
      TestHarness.assert(
        recovery.systemInstruction.includes('Do NOT greet again'),
        'The model must be told not to greet again'
      );

      // The client still owns what it genuinely owns: conversation context, not the prompt.
      const payload = ContextBuilder.buildContext(testPreset, runtimeState, memoryManager, transcriptStore, 8, true);
      TestHarness.assert(
        (payload as unknown as Record<string, unknown>).systemInstruction === undefined,
        'The client must not compose its own system instruction'
      );
      TestHarness.assert(
        payload.compiledContext.includes('SELECTING_SLOT'),
        'The client context must still carry the authoritative runtime state'
      );
    })
  );

  // Test 5: Section 06 Generation Fencing rejects stale connection callbacks
  results.push(
    await TestHarness.runTest('GeminiResumption', 'ConnectionGuard rejects stale callbacks from superseded connections', () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      const conn1 = AuraSessionManager.createConnection(session, 1);
      AuraSessionManager.attachConnection(session, conn1);

      // Connection 1 is active
      TestHarness.assert(ConnectionGuard.isConnectionCurrent(session, conn1.connectionId, 1), 'Conn1 must be current');

      // Now connection 2 supersedes connection 1
      const conn2 = AuraSessionManager.createConnection(session, 2);
      AuraSessionManager.attachConnection(session, conn2);

      // Conn 1 callback arrives delayed
      const isConn1Current = ConnectionGuard.isConnectionCurrent(session, conn1.connectionId, 1);
      TestHarness.assert(!isConn1Current, 'Old Conn1 callback must be rejected as stale');

      // Conn 2 callback arrives
      const isConn2Current = ConnectionGuard.isConnectionCurrent(session, conn2.connectionId, 2);
      TestHarness.assert(isConn2Current, 'Conn2 callback must be accepted as current');
    })
  );

  // Test 6: an unverified replacement must never be promoted, and a failed one must leave the
  // working connection in place. This is the invariant the extracted transport depends on.
  results.push(
    await TestHarness.runTest('GeminiResumption', 'a replacement is promoted only after real verification', async () => {
      const authority = new ConnectionAuthority({ now: () => 1_000, onLog: () => {} });
      const initial = authority.issueInitial();
      TestHarness.assert(authority.isCurrent(initial.connectionId, initial.generation), 'the first connection is current');

      // A replacement whose handshake never verifies resolves false.
      const failed = await authority.requestReplacement('RECOVERY', async () => false);
      TestHarness.assertEqual(failed.verified, false, 'an unverified replacement must not report success');
      TestHarness.assertEqual(
        failed.ticket.state,
        'FAILED',
        'an unverified replacement must be marked failed'
      );
      TestHarness.assert(
        authority.isCurrent(initial.connectionId, initial.generation),
        'a failed handoff must leave the working connection current'
      );

      // A verified replacement takes over and retires the old one.
      const ok = await authority.requestReplacement('RECOVERY', async () => true);
      TestHarness.assertEqual(ok.verified, true, 'a verified replacement must report success');
      TestHarness.assert(
        authority.isCurrent(ok.ticket.connectionId, ok.ticket.generation),
        'the verified replacement must become current'
      );
      TestHarness.assert(
        !authority.isCurrent(initial.connectionId, initial.generation),
        'the superseded connection must no longer be current'
      );
      // A failed attempt still consumes its generation. That is the point: a late frame from
      // the discarded connection carries a lower generation than the new one, so the fence can
      // tell them apart. Reusing a generation would make a stale frame indistinguishable from
      // a live one, which is exactly the bug generation fencing exists to prevent.
      TestHarness.assert(
        ok.ticket.generation > initial.generation,
        'a replacement must carry a strictly newer generation than the connection it supersedes'
      );
      TestHarness.assertEqual(
        ok.ticket.generation,
        initial.generation + 2,
        'the failed attempt must still consume its generation, so generations are never reused'
      );
    })
  );

  results.push(
    await TestHarness.runTest('GeminiResumption', 'concurrent replacement requests coalesce into one connection', async () => {
      // Two components noticing the same dropout must not open two replacements and race each
      // other. The second caller joins the first attempt and observes the same outcome.
      const authority = new ConnectionAuthority({ now: () => 2_000, onLog: () => {} });
      const initial = authority.issueInitial();

      let runs = 0;
      const runner = async () => {
        runs += 1;
        await new Promise((r) => setTimeout(r, 5));
        return true;
      };

      const [a, b] = await Promise.all([
        authority.requestReplacement('RENEWAL', runner),
        authority.requestReplacement('FALLBACK', runner),
      ]);

      TestHarness.assertEqual(runs, 1, 'only one replacement connection may be created');
      TestHarness.assertEqual(a.coalesced, false, 'the first requester owns the attempt');
      TestHarness.assertEqual(b.coalesced, true, 'the second requester must coalesce onto it');
      TestHarness.assertEqual(b.ticket.connectionId, a.ticket.connectionId, 'both must observe one ticket');
      TestHarness.assert(
        authority.isCurrent(initial.connectionId, initial.generation) === false,
        'the replacement took over from the initial connection'
      );
    })
  );

  results.push(
    await TestHarness.runTest('GeminiResumption', 'a handoff frame is fenced before it can mutate the session', () => {
      // The extracted transport checks this before parsing frames on a replacement socket and
      // again before promoting. A frame that arrives after the session moved on must be dropped.
      const session = AuraSessionManager.createSession(testPreset, 1);
      const conn1 = AuraSessionManager.createConnection(session, 1);
      AuraSessionManager.attachConnection(session, conn1);
      const active = { context: session.context, transport: session.transport } as any;

      const ctx = { sessionId: session.context.sessionId };

      // In flight, no promotion yet: accepted, because this is the replacement's own handshake.
      TestHarness.assert(
        ConnectionGuard.validateHandoffEvent(ctx, { connectionId: 'conn_new', generation: 2 }, active, {
          inFlight: true,
          current: false,
        }),
        'an in-flight replacement must be allowed to complete its handshake'
      );

      // Once promoted, the transport must agree exactly, or the frame is stale.
      const promoted = { context: session.context, transport: { connectionId: 'conn_other', connectionGeneration: 3 } } as any;
      TestHarness.assert(
        !ConnectionGuard.validateHandoffEvent(ctx, { connectionId: 'conn_old', generation: 2 }, promoted, {
          inFlight: false,
          current: true,
        }),
        'a frame from a superseded connection must be dropped after promotion'
      );

      // A frame for a different session is never ours.
      TestHarness.assert(
        !ConnectionGuard.validateHandoffEvent({ sessionId: 'sess_other' }, { connectionId: 'conn_new', generation: 2 }, active, {
          inFlight: true,
          current: true,
        }),
        'a frame for another session must be dropped'
      );

      // No active session at all.
      TestHarness.assert(
        !ConnectionGuard.validateHandoffEvent(ctx, { connectionId: 'conn_new', generation: 2 }, null, {
          inFlight: true,
          current: true,
        }),
        'a frame with no live session must be dropped'
      );
    })
  );

  // Test 7: RecoveryManager strategy selection (RESUME vs FRESH)
  results.push(
    await TestHarness.runTest('GeminiResumption', 'RecoveryManager selects RESUME when eligible and FRESH otherwise', async () => {
      const session = AuraSessionManager.createSession(testPreset, 1);
      const conn = AuraSessionManager.createConnection(session, 1);
      AuraSessionManager.attachConnection(session, conn);
      AuraSessionManager.markConnected(session, conn.connectionId, 1);

      let initiatedMode: string | null = null;
      let initiatedHandle: string | null = null;

      const recoveryAuthority = new RecoveryManager({
        // A Connection Authority is required: RecoveryManager may only request a
        // replacement, never mint identity itself.
        authority: new ConnectionAuthority({ onLog: () => {} }),
        onLog: () => {},
        onReconnectInitiated: async (_ticket, _opId, mode, handle) => {
          initiatedMode = mode;
          initiatedHandle = handle;
          return true;
        },
      });

      // Case A: No handle -> FRESH mode
      recoveryAuthority.reportFailure(session, 'WEBSOCKET', 'Transport drop');
      const opFresh = recoveryAuthority.getCurrentOperation();
      TestHarness.assertEqual(opFresh?.mode, 'FRESH', 'Must select FRESH mode when not eligible');
      TestHarness.assertEqual(opFresh?.generation, 0, 'Generation must be allocated by the authority, not the manager');
      recoveryAuthority.cancel();

      // Case B: Valid resumption handle -> RESUME mode
      AuraSessionManager.updateResumptionState(session, conn.connectionId, 'token_live_resume_999', true);
      recoveryAuthority.reportFailure(session, 'WEBSOCKET', 'Transport drop 2');
      const opResume = recoveryAuthority.getCurrentOperation();
      TestHarness.assertEqual(opResume?.mode, 'RESUME', 'Must select RESUME mode when eligible');
      TestHarness.assertEqual(opResume?.resumptionHandle, 'token_live_resume_999', 'Must pass resumption handle');
      TestHarness.assertEqual(opResume?.generation, 0, 'Generation must still be owned by the authority');

      // Fallback from RESUME to FRESH when the provider rejects the handle.
      await recoveryAuthority.fallbackToFresh(session);
      TestHarness.assertEqual(initiatedMode, 'FRESH', 'Fallback must request a FRESH connection');
      TestHarness.assertEqual(initiatedHandle, null, 'Fallback must not send a resumption handle');
      TestHarness.assertEqual(opResume?.mode, 'FRESH', 'Must transition operation mode to FRESH on fallback');
      TestHarness.assertEqual(opResume?.resumptionHandle, null, 'Must clear resumption handle on fallback');

      recoveryAuthority.cancel();
    })
  );

  return results;
}
