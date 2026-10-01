import { TestHarness, TestResult } from '../TestHarness';
import { ErrorClassifier, ErrorManager, UserErrorMapper, ErrorCode, ErrorDiagnostics } from '../../core/errors';
import { KnowledgePolicy, KnowledgeResolver } from '../../knowledge';
import { PersonaRegistry } from '../../personas/PersonaRegistry';
import { getRequirementPolicyForPersona } from '../../core/entities/RequirementPolicy';
import { MissingInfoResolver } from '../../core/entities/MissingInfoResolver';
import { INITIAL_CONVERSATION_STATE } from '../../core/conversation/ConversationState';
import type { ConversationRuntimeState } from '../../core/conversation/ConversationState';

/**
 * Three guarantees that the closed dead code must not take with it.
 *
 * 1. F-22: the error taxonomy classifies rather than decorates. A machine failure must
 *    never be reported to a caller as a statement about the business, and the tool
 *    failure vocabulary must have exactly one mapping.
 * 2. F-40: the client-side knowledge layer restates no price, hour, policy or address.
 *    Those belong to the server-owned BUSINESS FACTS block, and a second statement of them
 *    in the browser is a second authority for the same fact.
 * 3. F-08: what the conversation asks for is what the booking validator demands, for every
 *    persona, because both read the persona definition.
 */

function runtimeState(intent: ConversationRuntimeState['intent']): ConversationRuntimeState {
  return { ...INITIAL_CONVERSATION_STATE, intent };
}

/** Fact keys that would be a client-side claim about the business itself. */
const BUSINESS_FACT_KEY_PREFIXES = ['pricing.', 'business.hours', 'business.location', 'business.cancellation_policy'];

export async function runAuthorityHardeningTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: An infrastructure outage is not a statement about the calendar.
  results.push(
    await TestHarness.runTest('ErrorTaxonomy', 'Provider outage is never classified as a business fact', () => {
      const outage = ErrorClassifier.classify(new Error('Calendar provider is temporarily unavailable (503)'));
      TestHarness.assert(
        outage.code !== ErrorCode.BOOKING_NO_AVAILABILITY,
        'A provider outage must not be classified as "no availability"'
      );
      TestHarness.assertEqual(outage.category, 'RECOVERABLE', 'A provider outage is recoverable, not a business failure');
      TestHarness.assertEqual(outage.source, 'TOOL', 'A provider outage is sourced from the tool layer');

      const spoken = UserErrorMapper.toSpokenMessage(outage);
      TestHarness.assert(
        !/isn't open|not available|is booked|no openings/i.test(spoken),
        `The spoken line must not claim anything about the calendar, got: "${spoken}"`
      );
    })
  );

  // Test 2: Genuine calendar answers still classify as business failures.
  results.push(
    await TestHarness.runTest('ErrorTaxonomy', 'A real absence of availability is still a business failure', () => {
      const noSlot = ErrorClassifier.classify(new Error('No availability for 2026-10-02 at 14:00'));
      TestHarness.assertEqual(
        noSlot.code,
        ErrorCode.BOOKING_NO_AVAILABILITY,
        'A verified absence of availability must classify as a business failure'
      );
      TestHarness.assertEqual(noSlot.category, 'BUSINESS_FAILURE', 'Verified absence is a business failure');
      TestHarness.assertEqual(
        UserErrorMapper.toSpokenMessage(noSlot),
        "That specific time slot isn't open on the calendar. Let me offer you our next available opening.",
        'A verified absence is spoken as a business fact'
      );

      const conflict = ErrorClassifier.classify(new Error('CONFLICT: Slot is already booked.'));
      TestHarness.assertEqual(conflict.code, ErrorCode.BOOKING_CONFLICT, 'A double booking classifies as a conflict');
    })
  );

  // Test 3: Audio denial is only inferred from audio.
  results.push(
    await TestHarness.runTest('ErrorTaxonomy', 'Microphone denial is distinguished from unrelated words', () => {
      const mic = ErrorClassifier.classify(new Error('NotAllowedError: Permission denied'));
      TestHarness.assertEqual(
        mic.code,
        ErrorCode.AUDIO_PERMISSION_DENIED,
        'The browser microphone refusal is an audio user-action error'
      );
      TestHarness.assertEqual(mic.category, 'USER_ACTION', 'A microphone refusal needs the user to act');

      const notMic = ErrorClassifier.classify(new Error('EACCES: permission denied, open /var/lib/aura.db'));
      TestHarness.assert(
        notMic.code !== ErrorCode.AUDIO_PERMISSION_DENIED,
        'A filesystem permission failure must not be reported to the caller as a microphone problem'
      );

      const substring = ErrorClassifier.classify(new Error('atomic write failed'));
      TestHarness.assert(
        substring.code !== ErrorCode.AUDIO_PERMISSION_DENIED,
        '"atomic" contains the letters of "mic" and must not trigger the audio rule'
      );
    })
  );

  // Test 4: The tool failure vocabulary has exactly one mapping, and it composes with the
  // recovery policy, the spoken mapper and the audit log in a single call.
  results.push(
    await TestHarness.runTest('ErrorTaxonomy', 'Tool failures classify, act and speak from one entry point', () => {
      ErrorDiagnostics.clear();

      const unavailable = ErrorManager.handleToolFailure(
        { code: 'UNAVAILABLE', message: 'sendConfirmation provider is not configured' },
        { sessionId: 'sess_1', personaId: 'aura-salon', operationId: 'op_1', attemptCount: 0 }
      );
      TestHarness.assertEqual(unavailable.error.code, ErrorCode.TOOL_UNAVAILABLE, 'UNAVAILABLE maps to a tool failure');
      TestHarness.assert(unavailable.error.retryable, 'A missing provider is worth retrying');
      TestHarness.assertEqual(unavailable.action.action, 'RETRY', 'A retryable failure is retried first');
      TestHarness.assert(
        !/isn't open|no openings/i.test(unavailable.spokenMessage),
        'An unconfigured provider must not be spoken as a calendar answer'
      );

      const exhausted = ErrorManager.handleToolFailure(
        { code: 'TIMEOUT', message: 'calendar timed out' },
        { sessionId: 'sess_1', attemptCount: 99 }
      );
      TestHarness.assertEqual(
        exhausted.action.action,
        'ESCALATE_HUMAN',
        'Exhausted retries escalate to a human rather than looping'
      );

      const conflict = ErrorManager.handleToolFailure(
        { code: 'CONFLICT', message: 'CONFLICT: Slot is already booked.' },
        { sessionId: 'sess_1' }
      );
      TestHarness.assertEqual(
        conflict.action.action,
        'CONTINUE_CONVERSATION',
        'A booking conflict keeps the conversation going with an alternative'
      );

      const logs = ErrorDiagnostics.getLogs('sess_1');
      TestHarness.assertEqual(logs.length, 3, 'Every handled failure is recorded once');
      TestHarness.assertEqual(logs[0].code, ErrorCode.TOOL_UNAVAILABLE, 'The audit log records the classified code');

      ErrorDiagnostics.clear();
    })
  );

  // Test 5: Nothing technical is spoken to a caller.
  results.push(
    await TestHarness.runTest('ErrorTaxonomy', 'Technical tool text is never spoken verbatim', () => {
      const handled = ErrorManager.handleToolFailure({
        code: 'AUTHORIZATION_ERROR',
        message:
          'Appointment booking requires explicit final confirmation before transaction execution.',
      });
      TestHarness.assertEqual(handled.error.code, ErrorCode.POLICY_VIOLATION, 'An authorization refusal is a policy refusal');
      TestHarness.assert(
        !/transaction execution/i.test(handled.spokenMessage),
        `The spoken line must not contain the raw tool message, got: "${handled.spokenMessage}"`
      );
    })
  );

  // Test 5b: NOT_FOUND means "I could not find that", which is not the same as "that slot
  // is taken". Only a message that names a calendar may become a calendar fact.
  results.push(
    await TestHarness.runTest('ErrorTaxonomy', 'A missing lookup is never spoken as a calendar answer', () => {
      const missingPrice = ErrorManager.handleToolFailure({
        code: 'NOT_FOUND',
        message: 'No published price for "Deep Tissue Facial". Do not quote a price; offer a callback or transfer.',
      });
      TestHarness.assert(
        missingPrice.error.code !== ErrorCode.BOOKING_NO_AVAILABILITY,
        'A missing price is not evidence about any calendar'
      );
      TestHarness.assertEqual(
        missingPrice.error.code,
        ErrorCode.TOOL_NO_AUTHORITATIVE_ANSWER,
        'A lookup with no authoritative answer is a knowledge gap, not a refusal'
      );
      TestHarness.assert(
        !/isn't open|no openings|already reserved/i.test(missingPrice.spokenMessage),
        `The spoken line must not claim anything about availability, got: "${missingPrice.spokenMessage}"`
      );
      TestHarness.assert(
        !/guess/i.test(missingPrice.spokenMessage) || /won't guess|do not want to guess/i.test(missingPrice.spokenMessage),
        'The honest line states that it will not invent an answer'
      );
      TestHarness.assertEqual(
        missingPrice.action.action,
        'ESCALATE_HUMAN',
        'A lookup that cannot be answered reaches a human instead of retrying forever'
      );
      TestHarness.assert(
        !/restore our live connection/i.test(missingPrice.action.spokenNotice ?? ''),
        'The handoff line must not invent a connection outage'
      );

      const missingSlot = ErrorManager.handleToolFailure({
        code: 'NOT_FOUND',
        message: 'No availability for 2026-10-02 at 14:00',
      });
      TestHarness.assertEqual(
        missingSlot.error.code,
        ErrorCode.BOOKING_NO_AVAILABILITY,
        'A message that names a calendar may still be a business fact'
      );
    })
  );

  // Test 6: The client knowledge layer states no business fact, for any persona.
  results.push(
    await TestHarness.runTest('KnowledgeAuthority', 'Client context never restates a price, hour or policy', () => {
      const personas = PersonaRegistry.list();
      TestHarness.assert(personas.length > 1, 'The registry must contain more than one persona for this to mean anything');

      for (const persona of personas) {
        const priceQuery = KnowledgeResolver.resolveContextualFacts(
          persona.id,
          runtimeState('PRICING'),
          'how much does it cost?'
        );
        const hoursQuery = KnowledgeResolver.resolveContextualFacts(
          persona.id,
          runtimeState('BUSINESS_INFORMATION'),
          'what are your hours and where are you?'
        );
        const policyQuery = KnowledgeResolver.resolveContextualFacts(
          persona.id,
          runtimeState('GENERAL_INQUIRY'),
          'what is your cancellation policy?'
        );

        for (const fact of [...priceQuery, ...hoursQuery, ...policyQuery]) {
          const isBusinessFact = BUSINESS_FACT_KEY_PREFIXES.some((prefix) => fact.key.startsWith(prefix));
          TestHarness.assert(
            !isBusinessFact,
            `${persona.id} must not emit a client-side business fact, got "${fact.key}"`
          );
        }
      }
    })
  );

  // Test 7: Dynamic state is deferred to a live tool rather than answered.
  results.push(
    await TestHarness.runTest('KnowledgeAuthority', 'Availability questions are deferred to a live tool', () => {
      for (const intent of ['BOOKING', 'CANCELLATION', 'RESCHEDULING'] as const) {
        const facts = KnowledgeResolver.resolveContextualFacts(
          'aura-salon',
          runtimeState(intent),
          'do you have anything available tomorrow?'
        );
        const directive = facts.find((f) => f.key === 'authority.dynamic_state');
        TestHarness.assert(Boolean(directive), `${intent} must emit the defer-to-tool directive`);
        TestHarness.assertEqual(
          directive?.source,
          'LIVE_TOOL',
          'The deferral directive is attributed to the live tool, not to config'
        );
        TestHarness.assert(
          !facts.some((f) => f.key.startsWith('business.') || f.key.startsWith('pricing.')),
          `${intent} must not answer availability from context`
        );
      }

      TestHarness.assertEqual(
        KnowledgePolicy.evaluateQuery('aura-salon', 'can I cancel my appointment?', 'CANCELLATION').status,
        'REQUIRES_TOOL',
        'A cancellation is about an existing booking, so only a live tool can answer it'
      );
    })
  );

  // Test 8: A scope refusal is still produced, and is the only kind of fact emitted.
  results.push(
    await TestHarness.runTest('KnowledgeAuthority', 'Out-of-scope questions produce a boundary, not a fact', () => {
      const facts = KnowledgeResolver.resolveContextualFacts(
        'aura-salon',
        runtimeState('GENERAL_INQUIRY'),
        'do I have cancer?'
      );
      TestHarness.assertEqual(facts.length, 1, 'A refused question produces exactly one boundary line');
      TestHarness.assertEqual(facts[0].key, 'safety.boundary', 'The line is a scope boundary');
      TestHarness.assert(
        !/diagnos/i.test(String(facts[0].value)) || /cannot|does not/i.test(String(facts[0].value)),
        'A boundary must not assert a diagnosis'
      );
    })
  );

  // Test 9: F-08. What the conversation collects is what the booking validator requires.
  results.push(
    await TestHarness.runTest('BookingRequirements', 'Requirements are read from every persona, not a stale key list', () => {
      for (const persona of PersonaRegistry.list()) {
        const policy = getRequirementPolicyForPersona(persona.id);
        const required = new Set(persona.contactPolicy.required);
        for (const field of ['name', 'email', 'phone', 'service', 'date', 'time'] as const) {
          TestHarness.assertEqual(
            policy[field],
            required.has(field) ? 'required' : 'optional',
            `${persona.id}: "${field}" must match the persona's own contactPolicy`
          );
        }
        for (const field of ['partySize', 'vehicleInfo'] as const) {
          if (required.has(field)) {
            TestHarness.assertEqual(
              policy[field],
              'required',
              `${persona.id}: "${field}" is required by the persona and must be collected`
            );
          }
        }
      }
    })
  );

  // Test 10: The two personas that were silently mis-keyed now drive the conversation.
  results.push(
    await TestHarness.runTest('BookingRequirements', 'A missing field is actually asked for', () => {
      const auto = MissingInfoResolver.analyze({}, 'torque-motors', 'BOOKING');
      TestHarness.assert(
        auto.missingRequired.includes('vehicleInfo'),
        'The auto shop must be asked for a vehicle description'
      );
      TestHarness.assert(
        auto.missingRequired.includes('phone'),
        'The auto shop requires a phone number, so the agent must ask for one'
      );

      const dining = MissingInfoResolver.analyze({}, 'bistro-dining', 'BOOKING');
      TestHarness.assert(
        dining.missingRequired.includes('partySize'),
        'The restaurant must be asked for a party size'
      );

      const salon = MissingInfoResolver.analyze({}, 'aura-salon', 'BOOKING');
      TestHarness.assertEqual(
        salon.missingRequired.includes('phone'),
        false,
        'The salon treats a phone number as optional and must not insist on it'
      );
    })
  );

  return results;
}
