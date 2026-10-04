import { PersonaRegistry } from '../personas/PersonaRegistry';
import { KnowledgeStatus } from './KnowledgeTypes';

const OUT_OF_SCOPE_QUERY_KEYWORDS = [
  'do i have',
  'is it cancer',
  'diagnose',
  'diagnosis',
  'cure for',
  'symptoms of',
  'should i take',
];

const LEGAL_QUERY_KEYWORDS = [
  'will i win',
  'guarantee my case',
  'legal interpretation',
  'is it legal to',
  'can i sue',
];

export class KnowledgePolicy {
  /**
   * Classifies a turn as answerable from server-owned config, answerable only by a live
   * tool, or outside what the agent may discuss at all.
   *
   * This is a ROUTING decision, not a knowledge lookup. Nothing here returns a price, an
   * opening hour or a policy: those are server-owned and are injected once, authoritatively,
   * by `PromptAuthority`. A client-side policy that re-derived them would be a second
   * authority for the same fact.
   */
  public static evaluateQuery(
    personaId: string,
    queryText: string,
    intent = 'GENERAL_INQUIRY'
  ): { status: KnowledgeStatus; restrictionReason?: string } {
    const persona = PersonaRegistry.get(personaId);
    const lower = queryText.toLowerCase();

    // 1. Medical scope guardrail.
    //    Keyed on `medicalAdvice` alone. A persona that permits no medical advice must
    //    not have that permission quietly widened by an unrelated flag such as
    //    `diagnosis`; the previous `medicalAdvice && diagnosis` condition let a persona
    //    that enabled exactly one of the two opt out of the guardrail for both.
    if (!(persona.safety as any)?.medicalAdvice) {
      if (OUT_OF_SCOPE_QUERY_KEYWORDS.some((needle) => lower.includes(needle))) {
        return {
          status: 'OUT_OF_SCOPE',
          restrictionReason:
            'This assistant does not provide medical diagnoses or prescriptive advice. ' +
            'Please speak with a qualified professional about your symptoms.',
        };
      }
    }

    // 2. Legal scope guardrail.
    if (!(persona.safety as any)?.legalAdvice) {
      if (LEGAL_QUERY_KEYWORDS.some((needle) => lower.includes(needle))) {
        return {
          status: 'OUT_OF_SCOPE',
          restrictionReason:
            'This assistant does not provide legal opinions or guarantees. ' +
            'Please arrange a consultation with a qualified professional.',
        };
      }
    }

    // 3. Dynamic state: availability, and the existence or status of an appointment.
    //    Nothing about these is knowable without the live system, and none of it may be
    //    answered from memory or from conversation context.
    if (
      intent === 'BOOKING' ||
      intent === 'RESCHEDULING' ||
      intent === 'CANCELLATION' ||
      lower.includes('available') ||
      lower.includes('open slot') ||
      lower.includes('free at') ||
      lower.includes('my appointment')
    ) {
      return { status: 'REQUIRES_TOOL' };
    }

    // 4. Everything else: the server-owned BUSINESS FACTS block is the answer, and it is
    //    already in the prompt. Nothing further is added on this side of the wire.
    return { status: 'KNOWN' };
  }
}
