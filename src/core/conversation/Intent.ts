export type ConversationIntent =
  | 'GENERAL_INQUIRY'
  | 'BOOKING'
  | 'CANCELLATION'
  | 'RESCHEDULING'
  | 'PRICING'
  | 'BUSINESS_INFORMATION'
  | 'CUSTOMER_SUPPORT'
  | 'HUMAN_HANDOFF'
  | 'OTHER';

export interface IntentDetectionResult {
  primaryIntent: ConversationIntent;
  secondaryIntents: ConversationIntent[];
  confidence: number;
  rawTrigger?: string;
}

/**
 * Heuristic & pattern-based intent detection engine for rapid real-time conversational classification.
 */
export function detectIntentFromText(text: string): IntentDetectionResult {
  const lower = text.toLowerCase().trim();
  const secondary: ConversationIntent[] = [];

  // 1. Cancellation keywords
  if (
    lower.includes('cancel') ||
    lower.includes('drop my appointment') ||
    lower.includes('call off') ||
    lower.includes('void booking')
  ) {
    return {
      primaryIntent: 'CANCELLATION',
      secondaryIntents: secondary,
      confidence: 0.95,
      rawTrigger: 'cancellation_keyword',
    };
  }

  // 2. Rescheduling keywords
  if (
    lower.includes('reschedule') ||
    lower.includes('change my date') ||
    lower.includes('move my appointment') ||
    lower.includes('change time') ||
    lower.includes('different day')
  ) {
    return {
      primaryIntent: 'RESCHEDULING',
      secondaryIntents: secondary,
      confidence: 0.95,
      rawTrigger: 'reschedule_keyword',
    };
  }

  // 3. Pricing inquiries
  if (
    lower.includes('how much') ||
    lower.includes('price') ||
    lower.includes('cost') ||
    lower.includes('quote') ||
    lower.includes('rate') ||
    lower.includes('pricing') ||
    lower.includes('fee')
  ) {
    if (lower.includes('book') || lower.includes('schedule') || lower.includes('reserve') || lower.includes('appointment')) {
      secondary.push('PRICING');
    } else {
      return {
        primaryIntent: 'PRICING',
        secondaryIntents: secondary,
        confidence: 0.9,
        rawTrigger: 'pricing_keyword',
      };
    }
  }

  // 4. Secondary info: Parking, hours, address, directions
  if (
    lower.includes('parking') ||
    lower.includes('where are you located') ||
    lower.includes('address') ||
    lower.includes('hours') ||
    lower.includes('open today')
  ) {
    secondary.push('BUSINESS_INFORMATION');
  }

  // 5. Booking keywords
  if (
    lower.includes('book') ||
    lower.includes('schedule') ||
    lower.includes('appointment') ||
    lower.includes('reservation') ||
    lower.includes('come in') ||
    lower.includes('slot') ||
    lower.includes('bring my car') ||
    lower.includes('need a cut') ||
    lower.includes('clean my teeth') ||
    lower.includes('see a dentist')
  ) {
    return {
      primaryIntent: 'BOOKING',
      secondaryIntents: secondary,
      confidence: 0.95,
      rawTrigger: 'booking_keyword',
    };
  }

  // 6. Human handoff
  if (
    lower.includes('speak to human') ||
    lower.includes('talk to a person') ||
    lower.includes('real receptionist') ||
    lower.includes('representative') ||
    lower.includes('agent')
  ) {
    return {
      primaryIntent: 'HUMAN_HANDOFF',
      secondaryIntents: secondary,
      confidence: 0.98,
      rawTrigger: 'human_handoff_keyword',
    };
  }

  // 7. General inquiries / Business information fallback
  if (secondary.length > 0) {
    return {
      primaryIntent: secondary[0],
      secondaryIntents: secondary.slice(1),
      confidence: 0.85,
      rawTrigger: 'secondary_info_keyword',
    };
  }

  return {
    primaryIntent: 'GENERAL_INQUIRY',
    secondaryIntents: [],
    confidence: 0.7,
    rawTrigger: 'general_fallback',
  };
}
