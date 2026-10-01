import fs from 'fs';
import os from 'os';
import path from 'path';

import { TestHarness, TestResult } from '../TestHarness';
import { MemoryManager } from '../../core/memory/MemoryManager';
import { DEFAULT_MEMORY_POLICY } from '../../core/memory/MemoryPolicy';
import type { SessionFact } from '../../core/memory/SessionMemory';
import { SessionRegistry } from '../../server/sessions/SessionRegistry';
import {
  SilenceLadderPolicy,
  SILENCE_PROMPTS,
} from '../../core/conversation/SilenceLadderPolicy';

/**
 * F-11 support: caller-influenced memory must not be able to inflate the system context.
 *
 * The browser sends `sessionMemory` on every turn, and those strings end up in the prompt
 * the live model reads. The policy bounded how many facts existed but never how large one
 * could be, so a single oversized fact survived every subsequent turn and was paid for in
 * tokens on every request. Separately, the policy has always declared a sensitive-field
 * list that nothing ever read.
 *
 * These tests pin the properties that close both gaps.
 */

const SUITE = 'MemoryBounds';

export async function runSessionContinuityTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // The bug this file exists for: `activeSessionId` was a local inside the per-socket
  // handler, so a page refresh destroyed the only record that a call was in progress. The
  // caller then heard the agent introduce itself a second time.

  results.push(
    await TestHarness.runTest('SessionContinuity', 'a resumed call is recognized after the socket is gone', () => {
      let clock = 1_000;
      const registry = new SessionRegistry({ now: () => clock });

      registry.attach('sess_a', 'aura-salon');
      registry.markGreeted('sess_a');

      // The socket dies. The record must survive it, because the browser is coming back.
      const hint = registry.resumeHint('sess_a');
      TestHarness.assert(hint !== null, 'the call must still be known to the server after a refresh');
      TestHarness.assertEqual(
        hint!.suppressGreeting,
        true,
        'a call that was already greeted must not greet again after a refresh'
      );
      clock += 1_000;
    })
  );

  results.push(
    await TestHarness.runTest('SessionContinuity', 'attaching again does not reset the greeted flag', () => {
      const registry = new SessionRegistry();
      registry.attach('sess_a', 'aura-salon');
      registry.markGreeted('sess_a');

      // This is the refresh path: same session id, brand new client, first configure frame.
      const record = registry.attach('sess_a', 'aura-salon');

      TestHarness.assertEqual(record.attachments, 2, 'a second attachment must be recorded');
      TestHarness.assertEqual(record.greeted, true, 'reattaching must not clear the greeted flag');
    })
  );

  results.push(
    await TestHarness.runTest('SessionContinuity', 'a first call still greets', () => {
      const registry = new SessionRegistry();
      registry.attach('sess_b', 'aura-salon');

      // Suppressing the greeting everywhere would be as broken as never suppressing it: the
      // caller would hear silence on first contact.
      const hint = registry.resumeHint('sess_b');
      TestHarness.assertEqual(hint?.suppressGreeting, false, 'a brand new call must greet');
    })
  );

  results.push(
    await TestHarness.runTest('SessionContinuity', 'an unknown session is not resumable', () => {
      const registry = new SessionRegistry();
      TestHarness.assertEqual(
        registry.resumeHint('never_seen'),
        null,
        'a session the server has never seen must not claim to be resumable'
      );
    })
  );

  // Persona identity is bound to the session id for the call's whole life. `attach` used to
  // overwrite the persona from whatever the client last sent, so a reconnect could re-brand an
  // in-progress call: the same `greeted` flag and `startedAt`, but a different business answering
  // as though the caller were theirs. Continuity and identity cannot both be honoured, so the
  // registry now refuses the rebind and the server rejects the connection.
  results.push(
    await TestHarness.runTest('PersonaLock', 'a session cannot be rebound to a different persona', () => {
      const registry = new SessionRegistry();
      registry.attach('sess_lock', 'aura-salon');
      registry.markGreeted('sess_lock');

      TestHarness.assertEqual(
        registry.personaMismatch('sess_lock', 'aura-salon'),
        false,
        'resuming under the same persona must be allowed'
      );
      TestHarness.assertEqual(
        registry.personaMismatch('sess_lock', 'aura-dental'),
        true,
        'resuming an established call under a different persona must be detected as a mismatch'
      );
      TestHarness.assertEqual(
        registry.personaMismatch('never_seen', 'aura-dental'),
        false,
        'an unknown session is not a mismatch; it is simply a new call'
      );

      // The record must survive the rejected attempt untouched: the rebind is refused, so
      // identity is not changed and the greeted flag is not consumed.
      const record = registry.get('sess_lock');
      TestHarness.assertEqual(record?.personaId, 'aura-salon', 'the persona must not be overwritten');
      TestHarness.assertEqual(record?.greeted, true, 'a refused rebind must not clear the greeted flag');
    })
  );

  results.push(
    await TestHarness.runTest('PersonaLock', 'persona identity survives a reattach of the same persona', () => {
      const registry = new SessionRegistry();
      registry.attach('sess_same', 'aura-salon');
      registry.markGreeted('sess_same');
      registry.attach('sess_same', 'aura-salon');
      registry.attach('sess_same', 'aura-salon');

      const record = registry.get('sess_same');
      TestHarness.assertEqual(record?.personaId, 'aura-salon', 'the persona must be stable');
      TestHarness.assertEqual(record?.attachments, 3, 'each reattach is still counted');
      TestHarness.assertEqual(record?.greeted, true, 'the call still must not greet twice');
    })
  );

  results.push(
    await TestHarness.runTest('PersonaLock', 'a refused rebind does not increment attachment counters', () => {
      const registry = new SessionRegistry();
      registry.attach('sess_count', 'aura-salon');
      const before = registry.get('sess_count')?.attachments ?? 0;

      // The server checks `personaMismatch` *before* calling `attach`, so a contradictory
      // identity must not reach the mutation at all.
      if (!registry.personaMismatch('sess_count', 'aura-dental')) {
        registry.attach('sess_count', 'aura-dental');
      }

      TestHarness.assertEqual(
        registry.get('sess_count')?.attachments,
        before,
        'a rejected resume must not be recorded as an attachment'
      );
    })
  );

  // The product requirement is a five-minute resumable window. This pins the shipped default
  // rather than a value passed in by the test, because the two-minute default it replaced
  // expired during ordinary use - a caller who refreshed after a short pause lost the call and
  // was greeted again by a receptionist with no memory of them. A TTL is the kind of constant
  // that drifts silently, so the default itself is the assertion.
  results.push(
    await TestHarness.runTest('SessionContinuity', 'the default resumable window is five minutes', () => {
      const previous = process.env.AURA_SESSION_TTL_MS;
      delete process.env.AURA_SESSION_TTL_MS;
      try {
        let clock = 10_000;
        const timed = new SessionRegistry({ now: () => clock });
        timed.attach('sess_window', 'aura-salon');
        timed.markGreeted('sess_window');

        // Four and a half minutes idle: well past the old two-minute default, and the caller
        // must still resume into the same greeted call rather than being greeted again.
        clock += 4.5 * 60 * 1000;
        const hint = timed.resumeHint('sess_window');
        TestHarness.assert(hint !== null, 'a caller idle under five minutes must still be resumable');
        TestHarness.assertEqual(
          hint?.suppressGreeting,
          true,
          'a resumed call must not be greeted a second time'
        );

        // Past five minutes it is forgotten, so an abandoned tab does not hold state open.
        clock += 60 * 1000;
        TestHarness.assertEqual(
          timed.resumeHint('sess_window'),
          null,
          'an idle call past five minutes must be forgotten'
        );
      } finally {
        if (previous !== undefined) process.env.AURA_SESSION_TTL_MS = previous;
      }
    })
  );

  results.push(
    await TestHarness.runTest('SessionContinuity', 'a call expires on its TTL so a tab closure cannot leak it', () => {
      let clock = 1_000;
      const registry = new SessionRegistry({ ttlMs: 5_000, now: () => clock });
      registry.attach('sess_c', 'aura-salon');
      registry.markGreeted('sess_c');

      clock += 4_000;
      TestHarness.assert(registry.resumeHint('sess_c') !== null, 'still within the TTL');

      clock += 2_000;
      TestHarness.assertEqual(
        registry.resumeHint('sess_c'),
        null,
        'an idle call past the TTL must be forgotten'
      );
    })
  );

  results.push(
    await TestHarness.runTest('SessionContinuity', 'the registry is bounded and evicts the least recently active call', () => {
      let clock = 1_000;
      const registry = new SessionRegistry({ maxSessions: 3, ttlMs: 1_000_000, now: () => clock });

      registry.attach('s1', 'p');
      clock += 10;
      registry.attach('s2', 'p');
      clock += 10;
      registry.attach('s3', 'p');
      clock += 10;
      // Re-touch s1 so it is the most recent, making s2 the eviction candidate.
      registry.touch('s1');
      clock += 10;
      registry.attach('s4', 'p');

      TestHarness.assertEqual(registry.size, 3, 'the hard cap must hold');
      TestHarness.assertEqual(registry.get('s2'), undefined, 'the least recently active call must be evicted');
      TestHarness.assert(registry.get('s1') !== undefined, 'the most recently active call must be kept');
    })
  );

  results.push(
    await TestHarness.runTest('SessionContinuity', 'recovery is counted separately from a same-page reconnect', () => {
      const registry = new SessionRegistry();
      registry.attach('sess_d', 'aura-salon');
      registry.markGreeted('sess_d');
      TestHarness.assertEqual(registry.get('sess_d')?.recoveries, 0, 'a new call has no recoveries');

      registry.markRecovered('sess_d');
      registry.markRecovered('sess_d');
      TestHarness.assertEqual(registry.get('sess_d')?.recoveries, 2, 'each recovery must be counted');
      TestHarness.assertEqual(registry.get('sess_d')?.stage, 'recovering', 'stage must reflect the interruption');
    })
  );

  results.push(
    await TestHarness.runTest('SessionContinuity', 'a call survives a server restart, not just a socket loss', () => {
      // The tests above prove the record outlives a *socket*, which was the original F-11
      // complaint. That was not the whole risk: a deploy or crash tears down the process too,
      // and a caller who refreshes into a new instance would have been greeted a second time.
      // The registry now mirrors to a journal and reloads on boot, so the suppression of the
      // duplicate greeting is durable rather than a property of one process's memory.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-sessions-'));
      const journal = path.join(dir, 'sessions.json');
      const file = new SessionRegistry({ persistTo: journal });

      file.attach('sess_restart', 'aura-salon');
      file.markGreeted('sess_restart');
      file.markRecovered('sess_restart');
      TestHarness.assertEqual(file.durable, true, 'the mirror must succeed on a writable directory');

      // A completely separate instance, as after a restart.
      const rebooted = new SessionRegistry({ persistTo: journal });
      const hint = rebooted.resumeHint('sess_restart');

      TestHarness.assert(hint !== null, 'the call must survive the process that created it');
      TestHarness.assertEqual(
        hint!.suppressGreeting,
        true,
        'a caller who already heard a greeting must not hear it again after a restart'
      );
      TestHarness.assertEqual(hint!.recoveries, 1, 'recovery history must survive the restart');
      TestHarness.assertEqual(hint!.personaId, 'aura-salon', 'the persona must be restored');

      fs.rmSync(dir, { recursive: true, force: true });
    })
  );

  results.push(
    await TestHarness.runTest('SessionContinuity', 'a session too old to resume is discarded on boot, not revived', () => {
      // Honouring an expired row would suppress a greeting for a call the caller has long
      // forgotten, which is its own kind of wrong answer. The TTL must be re-applied on load.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-sessions-ttl-'));
      const journal = path.join(dir, 'sessions.json');

      const first = new SessionRegistry({ persistTo: journal, ttlMs: 1_000, now: () => 1_000 });
      first.attach('sess_stale', 'aura-salon');
      first.markGreeted('sess_stale');

      // A later boot, past the TTL.
      const rebooted = new SessionRegistry({ persistTo: journal, ttlMs: 1_000, now: () => 90_000 });
      TestHarness.assertEqual(
        rebooted.resumeHint('sess_stale'),
        null,
        'a session past its TTL must not be resumable after a restart'
      );

      fs.rmSync(dir, { recursive: true, force: true });
    })
  );

  results.push(
    await TestHarness.runTest('SessionContinuity', 'an unwritable mirror degrades restart-resume without dropping the live call', () => {
      // The failure mode that matters: a read-only or missing data directory must not turn a
      // working call into an error. Sessions are best-effort persistence, so the call keeps
      // running from memory and the degradation is reported rather than thrown.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-sessions-ro-'));
      // A path whose parent is a file, not a directory: the journal can never be created.
      const blocker = path.join(dir, 'blocker');
      fs.writeFileSync(blocker, 'not a directory', 'utf8');
      const journal = path.join(blocker, 'sessions.json');

      const registry = new SessionRegistry({ persistTo: journal });
      registry.attach('sess_ro', 'aura-salon');
      registry.markGreeted('sess_ro');

      TestHarness.assert(
        registry.get('sess_ro') !== undefined,
        'the call must still be tracked and usable without a working mirror'
      );
      TestHarness.assertEqual(
        registry.get('sess_ro')?.greeted,
        true,
        'in-memory state must still advance normally'
      );
      TestHarness.assertEqual(
        registry.resumeHint('sess_ro') !== null,
        true,
        'a live call must still be resumable in-process'
      );
      TestHarness.assertEqual(registry.durable, false, 'the failed mirror must be reported, not hidden');

      fs.rmSync(dir, { recursive: true, force: true });
    })
  );

  results.push(
    await TestHarness.runTest('SessionContinuity', 'the registry holds no caller content', () => {
      const registry = new SessionRegistry();
      const record = registry.attach('sess_e', 'aura-salon');

      // A privacy property, asserted so a future field cannot quietly add transcript storage.
      const serialized = JSON.stringify(record).toLowerCase();
      TestHarness.assert(!serialized.includes('transcript'), 'no transcript may be stored');
      TestHarness.assert(!serialized.includes('name='), 'no caller name may be stored');
      TestHarness.assertEqual(
        Object.keys(record).sort().join(','),
        'attachments,greeted,lastActivityAt,personaId,recoveries,sessionId,stage,startedAt',
        'only call shape may be stored'
      );
    })
  );

  // ── Inactivity ladder (F-42) ──
  //
  // The rules that decide when a paying caller gets hung up on, which is not something to leave
  // untested. These were inline in the transport hook and therefore unreachable by this runner.

  results.push(
    await TestHarness.runTest('SilenceLadder', 'silence escalates gently before it ends the call', () => {
      const policy = new SilenceLadderPolicy();
      const live = { isActive: true, turnFrozen: false };

      const first = policy.advance(live);
      TestHarness.assertEqual(first.kind, 'nudge', 'the first quiet moment must only prompt');
      TestHarness.assert(
        (first as { prompt: string }).prompt.includes('still there'),
        'the first nudge should be a light check-in'
      );
      TestHarness.assert(!SILENCE_PROMPTS[0].includes('end the call'), 'the first nudge must not end the call');

      const second = policy.advance(live);
      TestHarness.assertEqual(second.kind, 'nudge', 'a second quiet moment must still only prompt');
      TestHarness.assert(
        !SILENCE_PROMPTS[1].includes('end the call'),
        'the second nudge must still be recoverable'
      );

      const third = policy.advance(live);
      TestHarness.assertEqual(third.kind, 'end', 'the third unanswered nudge must end the call');
      TestHarness.assert(policy.isEnding(), 'the policy must record that the farewell is committed');
    })
  );

  results.push(
    await TestHarness.runTest('SilenceLadder', 'an agent turn in flight suppresses the prompt', () => {
      // The defect this guards: a nudge landing while the agent is still speaking, so the
      // caller is prompted and the agent keeps talking. Two conversations at once.
      const policy = new SilenceLadderPolicy();
      const frozen = { isActive: true, turnFrozen: true };

      TestHarness.assertEqual(policy.advance(frozen).kind, 'wait', 'a frozen turn must not prompt');
      TestHarness.assertEqual(
        policy.shouldArm(frozen),
        false,
        'the ladder must not even arm while the agent holds the floor'
      );
      TestHarness.assertEqual(policy.checkCount(), 0, 'a suppressed check must not count as escalation');
    })
  );

  results.push(
    await TestHarness.runTest('SilenceLadder', 'a call that already ended is never prompted again', () => {
      const policy = new SilenceLadderPolicy();
      policy.advance({ isActive: true, turnFrozen: false });
      policy.advance({ isActive: true, turnFrozen: false });
      policy.advance({ isActive: true, turnFrozen: false });

      TestHarness.assertEqual(
        policy.advance({ isActive: true, turnFrozen: false }).kind,
        'wait',
        'no further prompt may be sent after the call is committed to end'
      );
      TestHarness.assertEqual(
        policy.shouldArm({ isActive: true, turnFrozen: false }),
        false,
        'the ladder must refuse to re-arm after a goodbye'
      );
    })
  );

  results.push(
    await TestHarness.runTest('SilenceLadder', 'three separate quiet moments cannot accumulate into a hang-up', () => {
      // The escalation counter is per quiet period. If it were per call, a two-minute
      // conversation with three natural pauses would be ended on a caller who never left.
      const policy = new SilenceLadderPolicy();
      const live = { isActive: true, turnFrozen: false };

      policy.advance(live);
      policy.reset();
      TestHarness.assertEqual(policy.checkCount(), 0, 'activity must clear the escalation count');

      policy.advance(live);
      policy.reset();
      policy.advance(live);
      TestHarness.assertEqual(
        policy.advance({ isActive: false, turnFrozen: false }).kind,
        'wait',
        'a dead session must not be prompted'
      );
      TestHarness.assertEqual(
        policy.checkCount(),
        1,
        'only the live check after the last reset may count; a dead session must not escalate'
      );
    })
  );

  results.push(
    await TestHarness.runTest('SilenceLadder', 'activity does not revoke a goodbye already playing', () => {
      // `reset` clears escalation but keeps the farewell. Cancelling it would strand the
      // caller: no prompt, no goodbye, and an open socket.
      const policy = new SilenceLadderPolicy();
      const live = { isActive: true, turnFrozen: false };
      policy.advance(live);
      policy.advance(live);
      policy.advance(live);

      policy.reset();
      TestHarness.assert(policy.isEnding(), 'the committed farewell must survive caller activity');
      TestHarness.assertEqual(policy.checkCount(), 0, 'the escalation count is still cleared');
    })
  );

  results.push(
    await TestHarness.runTest('SilenceLadder', 'a new call on the same page runs the ladder from the start', () => {
      // After a farewell, a caller who starts another call on the same page must not inherit a
      // permanently disarmed ladder - it would sit in silence forever.
      const policy = new SilenceLadderPolicy();
      const live = { isActive: true, turnFrozen: false };
      policy.advance(live);
      policy.advance(live);
      policy.advance(live);
      TestHarness.assert(policy.isEnding(), 'the first call ended');

      policy.rearm();
      TestHarness.assert(!policy.isEnding(), 'a new call must not inherit the previous goodbye');
      TestHarness.assertEqual(policy.checkCount(), 0, 'the new call starts with no escalation');
      TestHarness.assertEqual(policy.advance(live).kind, 'nudge', 'the new call must be able to prompt again');
    })
  );

  results.push(
    await TestHarness.runTest('SilenceLadder', 'the farewell is not honoured once the call is gone', () => {
      const policy = new SilenceLadderPolicy();
      const live = { isActive: true, turnFrozen: false };
      policy.advance(live);
      policy.advance(live);
      policy.advance(live);

      TestHarness.assertEqual(
        policy.shouldCloseNow(null),
        false,
        'a session that ended during the farewell must not be closed again'
      );
    })
  );

  return results;
}

export async function runMemoryBoundsTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // 1. A single oversized fact must not be stored.
  results.push(
    await TestHarness.runTest(SUITE, 'rejects a single fact that exceeds the per-fact character limit', () => {
      const mm = new MemoryManager('s1', 'p1');
      mm.addSessionFact('x'.repeat(DEFAULT_MEMORY_POLICY.maxFactChars + 1), 'fact', 'USER');

      TestHarness.assertEqual(mm.getState().sessionFacts.length, 0, 'oversized fact must not be retained');
      TestHarness.assert(
        !mm.formatForModelContext().includes('xxxx'),
        'oversized content must not appear in the model context'
      );
    })
  );

  // A fact exactly at the limit is legitimate and must survive intact. Rejecting at the
  // boundary would be an off-by-one that silently loses real caller information.
  results.push(
    await TestHarness.runTest(SUITE, 'accepts a fact exactly at the per-fact character limit', () => {
      const mm = new MemoryManager('s2', 'p1');
      mm.addSessionFact('y'.repeat(DEFAULT_MEMORY_POLICY.maxFactChars), 'fact', 'USER');

      TestHarness.assertEqual(mm.getState().sessionFacts.length, 1, 'a fact at the limit is valid');
      TestHarness.assertEqual(
        mm.getState().sessionFacts[0].content.length,
        DEFAULT_MEMORY_POLICY.maxFactChars,
        'content must be stored intact, not truncated'
      );
    })
  );

  // 2. The aggregate must be bounded even when every individual fact is valid.
  results.push(
    await TestHarness.runTest(SUITE, 'bounds total memory when many individually valid facts are added', () => {
      const mm = new MemoryManager('s3', 'p1');
      const perFact = DEFAULT_MEMORY_POLICY.maxFactChars;
      for (let i = 0; i < DEFAULT_MEMORY_POLICY.maxSessionFacts; i++) {
        mm.addSessionFact(`${String(i).padStart(4, '0')}${'z'.repeat(perFact - 4)}`, 'fact', 'USER');
      }

      const total = mm.getState().sessionFacts.reduce((sum, f) => sum + f.content.length, 0);
      TestHarness.assert(
        total <= DEFAULT_MEMORY_POLICY.maxTotalMemoryChars,
        `aggregate memory (${total}) must stay within ${DEFAULT_MEMORY_POLICY.maxTotalMemoryChars}`
      );
    })
  );

  // Facts are prepended, so index 0 is the most recent. Whatever survives must be the newest
  // material, with the oldest evicted first.
  results.push(
    await TestHarness.runTest(SUITE, 'evicts the oldest facts first when the aggregate is exceeded', () => {
      const mm = new MemoryManager('s4', 'p1');
      const perFact = DEFAULT_MEMORY_POLICY.maxFactChars;
      for (let i = 0; i < DEFAULT_MEMORY_POLICY.maxSessionFacts; i++) {
        mm.addSessionFact(`${String(i).padStart(4, '0')}${'q'.repeat(perFact - 4)}`, 'fact', 'USER');
      }

      const facts = mm.getState().sessionFacts;
      TestHarness.assert(facts.length > 0, 'at least the newest fact must be retained');
      TestHarness.assert(
        facts[0].content.startsWith('0024'),
        'newest fact must be retained'
      );
      TestHarness.assert(
        !facts.some((f) => f.content.startsWith('0000')),
        'oldest fact must be evicted before newer ones'
      );
    })
  );

  // 3. The declared sensitive-field list must actually be enforced.
  results.push(
    await TestHarness.runTest(SUITE, 'refuses to store fields on the sensitive list', () => {
      const mm = new MemoryManager('s5', 'p1');

      mm.updateCustomerMemory({ name: 'Sam Rivera' } as never);
      mm.updateCustomerMemory({ creditCard: '4111111111111111' } as never);
      mm.updateCustomerMemory({ password: 'hunter2' } as never);
      mm.updateCustomerMemory({ ssn: '123-45-6789' } as never);

      const stored = mm.getState().customerMemory as unknown as Record<string, unknown>;
      TestHarness.assertEqual(stored.creditCard, undefined, 'creditCard must never be stored');
      TestHarness.assertEqual(stored.password, undefined, 'password must never be stored');
      TestHarness.assertEqual(stored.ssn, undefined, 'ssn must never be stored');
      TestHarness.assertEqual(stored.name, 'Sam Rivera', 'non-sensitive fields must still persist');
    })
  );

  // A field-name filter is trivially bypassed if it matches only one exact spelling.
  results.push(
    await TestHarness.runTest(SUITE, 'matches sensitive fields across spelling variants', () => {
      const mm = new MemoryManager('s6', 'p1');
      TestHarness.assert(mm.isSensitiveField('cardNumber'), 'cardNumber must match');
      TestHarness.assert(mm.isSensitiveField('credit-card'), 'credit-card must match creditCard');
      TestHarness.assert(mm.isSensitiveField('CREDIT_CARD'), 'case and separators must not matter');
      TestHarness.assert(mm.isSensitiveField('userPassword'), 'userPassword must match password');
      TestHarness.assert(mm.isSensitiveField('ssn'), 'ssn must match');
      TestHarness.assert(mm.isSensitiveField('socialSecurityNumber'), 'long-form SSN must match');
      TestHarness.assert(mm.isSensitiveField('card_number'), 'card_number must match');
      TestHarness.assert(!mm.isSensitiveField('email'), 'email is not sensitive');
      TestHarness.assert(!mm.isSensitiveField('name'), 'name is not sensitive');
      // Guards against the substring rule rejecting ordinary fields whose names merely
      // contain a short sensitive fragment.
      TestHarness.assert(!mm.isSensitiveField('company'), 'company must not match a short alias');
      TestHarness.assert(!mm.isSensitiveField('notes'), 'notes must not match');
    })
  );

  // F-28: a memory reset must forget the caller, not the system's own rules.
  results.push(
    await TestHarness.runTest(SUITE, 'a memory reset forgets caller data but keeps system rules', () => {
      const seeded: SessionFact[] = [
        {
          id: 'seed_rule_1',
          category: 'protocol',
          content: 'Never quote a full payment card number back to the caller.',
          source: 'SYSTEM',
          timestamp: Date.now(),
        },
      ];
      const mm = new MemoryManager('s_reset', 'p1', undefined, seeded);
      mm.addSessionFact('Caller prefers a late appointment', 'preference', 'USER');
      TestHarness.assertEqual(mm.getState().sessionFacts.length, 2, 'both facts must be stored');

      // A reset is clear() followed by re-asserting the system rules. Doing only the first half
      // is the F-28 defect: the agent is left with no protocol rules for the rest of the call.
      mm.clear();
      TestHarness.assertEqual(mm.getState().sessionFacts.length, 0, 'a reset must forget the caller');
      mm.restoreSeededFacts(seeded);

      const after = mm.getState().sessionFacts;
      TestHarness.assertEqual(after.length, 1, 'the system rule must be restored after a reset');
      TestHarness.assertEqual(after[0].id, 'seed_rule_1', 'the rule keeps its identity');
      TestHarness.assert(
        !after.some((f) => f.content.includes('late appointment')),
        'the caller fact must not come back'
      );
    })
  );

  // The other half of F-28: a seeded rule must not be individually deletable, by the UI or by
  // anything else holding a `MemoryManager`.
  results.push(
    await TestHarness.runTest(SUITE, 'a seeded protocol rule cannot be deleted by the operator', () => {
      const seeded: SessionFact[] = [
        { id: 'seed_rule_1', category: 'protocol', content: 'Always confirm the price.', source: 'SYSTEM', timestamp: Date.now() },
        { id: 'seed_rule_2', category: 'protocol', content: 'Never guess a policy.', source: 'SYSTEM', timestamp: Date.now() },
      ];
      const mm = new MemoryManager('s_protect', 'p1', undefined, seeded);
      mm.addSessionFact('My name is Dana.', 'fact', 'USER');

      mm.removeSessionFact('seed_rule_1');
      TestHarness.assertEqual(
        mm.getState().sessionFacts.filter((f) => f.id === 'seed_rule_1').length,
        1,
        'the seeded rule must survive a delete attempt'
      );

      // The caller fact's id is generated, so it is read back rather than guessed.
      const callerFactId = mm.getState().sessionFacts.find((f) => f.content.includes('Dana'))!.id;
      mm.removeSessionFact(callerFactId);
      const remaining = mm.getState().sessionFacts;
      TestHarness.assertEqual(remaining.length, 2, 'only the caller fact is removed');
      TestHarness.assert(
        !remaining.some((f) => f.content.includes('Dana')),
        'a caller fact is deletable'
      );
      TestHarness.assert(mm.isProtectedFact('seed_rule_1'), 'the manager reports the rule as protected');
    })
  );

  // The privacy consequence of a reset, which is why the server must also be told: a forgotten
  // phone number must not still be sitting in the prompt the model is reading.
  results.push(
    await TestHarness.runTest(SUITE, 'a memory reset removes caller data from the model context', () => {
      const mm = new MemoryManager('s_forget', 'p1');
      mm.updateCustomerMemory({ name: 'Sam Rivera', phone: '+1-555-0100' });
      TestHarness.assert(
        mm.formatForModelContext().includes('555-0100'),
        'precondition: the phone number must be present before the reset'
      );

      mm.clear();
      const afterReset = mm.formatForModelContext();
      TestHarness.assert(
        !afterReset.includes('555-0100'),
        'a forgotten phone number must not remain in the prompt the model reads'
      );
      TestHarness.assert(
        !afterReset.includes('Sam Rivera'),
        'a forgotten name must not remain in the prompt the model reads'
      );
    })
  );

  return results;
}
