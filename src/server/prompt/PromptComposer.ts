import fs from 'fs';
import path from 'path';
import { PersonaRegistry } from '../../personas/PersonaRegistry';
import { PersonaBusinessTruth } from '../../personas/PersonaBusinessTruth';
import type { PersonaDefinition } from '../../personas/schema/persona.types';

export interface SessionStateTracking {
  confirmed: Record<string, any>;
  pending: Record<string, any>;
  stillMissing: string[];
  lastToolResult?: any;
}

export interface PromptComposerInput {
  personaId: string;
  sessionId: string;
  connectionId: string;
  isRecovery?: boolean;
  sessionState?: SessionStateTracking;
  sessionMemory?: string | null;
  instructionOverride?: string | null;
  at?: Date;
}

const CORE_BEHAVIOR_FALLBACK = `# AURA Core Behavior Layer
Priority order: 1. Life-safety scripts  2. Business truth and tool results  3. Persona rules  4. Style guide.
- Voice-first: 1-2 short natural sentences per turn with contractions.
- Never compute dates/times yourself; use DateResolver and tool results.
- State only verified services, hours, prices and FAQs from business data.
- Speak prices by type: fixed, starting_at, complimentary, menu_based, quote_required.
- Booking flow: service -> date & time -> checkAvailability -> name -> email -> read back -> createAppointment.
- One call is one session. Do not invent details.`;

function loadCoreBehavior(): string {
  try {
    const p = path.join(__dirname, '../../personas/behavior/core-behavior.md');
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8');
    }
  } catch {
    // Ignore and use fallback
  }
  return CORE_BEHAVIOR_FALLBACK;
}

export class PromptComposer {
  public static compose(input: PromptComposerInput): {
    systemInstruction: string;
    persona: PersonaDefinition;
    greetingPrompt: string;
  } {
    const persona = PersonaRegistry.get(input.personaId);
    const coreBehavior = loadCoreBehavior();

    // 1. Personality & Emotion Playbook Section
    const personality = persona.personality;
    const personalityBlock = personality
      ? [
          '=== PERSONA PERSONALITY & REGISTER ===',
          personality.traits ? `Traits: ${personality.traits.join(', ')}` : '',
          personality.slangTier !== undefined ? `Slang Tier: Tier ${personality.slangTier}` : '',
          personality.acknowledgements
            ? `Varied Acknowledgements: [${personality.acknowledgements.join(', ')}]`
            : '',
          personality.register?.avoid
            ? `Forbidden Corporate Words: [${personality.register.avoid.join(', ')}]`
            : '',
          personality.emotionPlaybook && personality.emotionPlaybook.length > 0
            ? 'Emotion Playbook:\n' +
              personality.emotionPlaybook
                .map((e) => `  - Situation: "${e.situation}" -> Empathy: "${e.empathy}" | Action: "${e.action}"`)
                .join('\n')
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '';

    // 2. FAQs Section
    const faqsBlock = (persona.faqs ?? [])
      .map((f) => `Q: ${f.q}\nA: ${f.a}`)
      .join('\n\n');

    // 3. Session State Block (Per-turn tracking)
    const state = input.sessionState ?? {
      confirmed: {},
      pending: {},
      stillMissing: persona.booking?.requiredEntities ?? ['service', 'date', 'time', 'customerName', 'email'],
    };

    const sessionStateBlock = [
      '=== CALL SESSION STATE (CALL-SCOPED) ===',
      `CONFIRMED: ${JSON.stringify(state.confirmed)}`,
      `PENDING: ${JSON.stringify(state.pending)}`,
      `STILL MISSING: [${state.stillMissing.join(', ')}]`,
      `LAST TOOL RESULT: ${state.lastToolResult ? JSON.stringify(state.lastToolResult) : 'none'}`,
      'RULE: You may ONLY ask the caller for fields in STILL MISSING. Never re-ask for items in CONFIRMED.',
    ].join('\n');

    const fullSystemInstruction = [
      coreBehavior,
      personalityBlock,
      faqsBlock ? `\n--- FREQUENTLY ASKED QUESTIONS ---\n${faqsBlock}` : '',
      '\n' + sessionStateBlock,
    ]
      .filter(Boolean)
      .join('\n\n');

    const greetingPrompt =
      persona.conversationStyle?.greetingPhrase ||
      persona.greetingPrompt ||
      `Thank you for calling ${persona.identity.businessName}. How may I help you?`;

    return {
      systemInstruction: fullSystemInstruction,
      persona,
      greetingPrompt,
    };
  }

  /**
   * Deterministic Life-Safety & Escalation Layer.
   * Matches caller keywords using strict word boundaries and phrase matching (case-insensitive)
   * before any model generation.
   */
  public static checkSafetyTriggers(
    personaId: string,
    transcriptText: string
  ): {
    triggered: boolean;
    triggerId?: string;
    action?: string;
    scriptedLine?: string;
    description?: string;
  } {
    const persona = PersonaRegistry.get(personaId);
    const triggers = persona.escalation?.triggers ?? [];
    const text = (transcriptText || '').trim();
    if (!text) return { triggered: false };

    for (const trigger of triggers) {
      for (const kw of trigger.detectKeywords) {
        const kwTrimmed = kw.trim();
        if (!kwTrimmed) continue;

        // Escape regex special characters while preserving apostrophes/spaces
        const escaped = kwTrimmed.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        // Enforce word boundaries on start and end of keyword/phrase
        const regex = new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i');

        if (regex.test(text)) {
          let line = trigger.scriptedLine;
          if (!line && trigger.action === 'give_business_phone') {
            line = `Please contact our office directly at ${persona.business.contact.phone}.`;
          } else if (!line && trigger.action === 'call_911') {
            line = 'If you are experiencing a life-threatening emergency, please hang up and dial 911 immediately.';
          }
          return {
            triggered: true,
            triggerId: trigger.id,
            action: trigger.action,
            scriptedLine: line,
            description: trigger.description,
          };
        }
      }
    }

    return { triggered: false };
  }
}
