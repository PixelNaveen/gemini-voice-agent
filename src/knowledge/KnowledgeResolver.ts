import { ConversationRuntimeState } from '../core/conversation';
import { KnowledgeFact, SOURCE_AUTHORITY_HIERARCHY } from './KnowledgeTypes';
import { KnowledgePolicy } from './KnowledgePolicy';

/**
 * SINGLE-AUTHORITY KNOWLEDGE RESOLUTION (F-40)
 *
 * This resolver runs in the BROWSER, on the client context-compilation path
 * (`ContextBuilder.buildContext`), and its output is shipped to the relay as the
 * untrusted `sessionMemory` blob. That has one hard consequence:
 *
 *   It must never restate a price, an opening hour, a policy or an address.
 *
 * It used to. It re-derived `pricing.*`, `business.hours`, `business.location` and
 * `business.cancellation_policy` from the persona JSON inside the browser and rendered
 * them under the heading "Authoritative Knowledge Facts" - a second, weaker authority
 * for exactly the facts the server already owns and injects as the BUSINESS FACTS block.
 * Two components producing statements about prices and hours is the failure mode this
 * codebase exists to eliminate, and the client copy is the one the server can least
 * control. The server copy is assembled in `PromptAuthority.assemble` from
 * `PersonaBusinessTruth`, evaluated at request time in the business timezone, and is
 * strictly more complete than anything produced here.
 *
 * What legitimately belongs in a client-side context is not a business fact but a
 * ROUTING signal: whether this turn may be answered from config at all, or whether only
 * a live tool can answer it. Those are emitted below as authority directives, which
 * cannot be mistaken for a claim about the business because they assert nothing about it.
 */
export class KnowledgeResolver {
  /**
   * Resolves the authoritative guidance for the current turn.
   *
   * Returns no price, hour, policy or availability claim: those belong to the
   * server-owned BUSINESS FACTS block and to live tool results.
   */
  public static resolveContextualFacts(
    personaId: string,
    runtimeState: ConversationRuntimeState,
    latestUserText = ''
  ): KnowledgeFact[] {
    const now = Date.now();
    const policyResult = KnowledgePolicy.evaluateQuery(
      personaId,
      latestUserText,
      runtimeState.intent || undefined
    );
    const facts: KnowledgeFact[] = [];

    // 1. Scope guardrail. This is a limit on what the agent may discuss, not a claim
    //    about the business, so it is safe to restate - and it is derived from the
    //    persona's own safety configuration rather than assumed.
    if (policyResult.status === 'OUT_OF_SCOPE' && policyResult.restrictionReason) {
      facts.push({
        key: 'safety.boundary',
        value: policyResult.restrictionReason,
        source: 'BUSINESS_CONFIG',
        confidence: 1.0,
        authority: SOURCE_AUTHORITY_HIERARCHY.BUSINESS_CONFIG,
        retrievedAt: now,
      });
      return facts;
    }

    // 2. Dynamic state (availability, existing bookings) is knowable only from a live
    //    tool. State that as an instruction to defer, never as an answer.
    if (policyResult.status === 'REQUIRES_TOOL') {
      facts.push({
        key: 'authority.dynamic_state',
        value:
          'Availability and existing bookings are not known here. Check the live calendar ' +
          'tool before naming any opening, and never state that a time is open or that an ' +
          'appointment exists unless that tool has just returned it.',
        source: 'LIVE_TOOL',
        confidence: 1.0,
        authority: SOURCE_AUTHORITY_HIERARCHY.LIVE_TOOL,
        retrievedAt: now,
        rawAttribution: 'knowledge-policy:REQUIRES_TOOL',
      });
    }

    // 3. Everything else is deliberately empty. `KNOWN` means "the server-owned
    //    BUSINESS FACTS block already answers this"; repeating it here would only add a
    //    second, client-controlled statement of the same fact.
    return facts;
  }
}
