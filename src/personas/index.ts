export * from './schema/persona.types';
export * from './schema/persona.validator';
export * from './PersonaRegistry';

import { PersonaRegistry } from './PersonaRegistry';
import { IndustryPreset } from '../types';

export function mapToIndustryPreset(p: any): IndustryPreset {
  const iconMap: Record<string, string> = {
    'aura-salon': 'Sparkles',
    'apex-dental': 'Activity',
    'torque-motors': 'Wrench',
    'grand-realty': 'Building',
    'vanguard-law': 'Shield',
    'bistro-dining': 'Coffee',
    'coolbreeze-hvac': 'PhoneCall',
  };

  const badgeMap: Record<string, string> = {
    'aura-salon': 'Hair & Beauty',
    'apex-dental': 'Healthcare',
    'torque-motors': 'Auto Repair',
    'grand-realty': 'Real Estate',
    'vanguard-law': 'Legal Services',
    'bistro-dining': 'Hospitality',
    'coolbreeze-hvac': 'HVAC & Trades',
  };

  const queryMap: Record<string, string[]> = {
    'aura-salon': [
      'Do you have any haircut slots tomorrow afternoon?',
      'How much is a balayage with gloss?',
      'Can I book a facial for Friday at 3 PM?',
      'What are your weekend hours?',
    ],
    'apex-dental': [
      'I have a sharp toothache and need an emergency exam.',
      'How much is a dental cleaning and checkup?',
      'Do you have any openings this Thursday morning?',
      'What is your cancellation policy?',
    ],
    'torque-motors': [
      'How much is a full synthetic oil change?',
      'Can you check my brakes tomorrow around 2 PM?',
      'My check engine light came on, do you do scans?',
      'What are your shop hours on Saturday?',
    ],
    'grand-realty': [
      'I would like to schedule a private tour for a penthouse.',
      'How do I get a comparative home valuation?',
      'Are you available this weekend for a buyer consultation?',
      'What properties are available on 5th Avenue?',
    ],
    'vanguard-law': [
      'I need to schedule a confidential legal consultation.',
      'How much is a commercial contract review session?',
      'Can I speak with someone regarding estate planning?',
      'What are your office hours this week?',
    ],
    'bistro-dining': [
      'Can I reserve a table for 4 tomorrow at 7 PM?',
      'How much is the 7-course chef tasting counter?',
      'Do you have private dining for a party of 8 this Saturday?',
      'What time does the kitchen close on Friday?',
    ],
    'coolbreeze-hvac': [
      'My AC stopped blowing cold air and I need a diagnostic visit.',
      'How much is an annual furnace safety tune-up?',
      'Can a technician come out tomorrow morning at 9 AM?',
      'Do you offer 24/7 emergency response?',
    ],
  };

  return {
    id: p.id,
    name: p.identity.name,
    businessName: p.identity.businessName,
    iconName: iconMap[p.id] || 'PhoneCall',
    badge: badgeMap[p.id] || 'Service',
    description: p.identity.description,
    systemPrompt: p.systemPrompt || `You are AURA for ${p.identity.businessName}.`,
    greetingPrompt: p.greetingPrompt || `Thank you for calling ${p.identity.businessName}. How may I help you?`,
    sampleQueries: queryMap[p.id] || ['What are your hours?', 'How can I book an appointment?'],
  };
}

export const ALL_PERSONAS: IndustryPreset[] = PersonaRegistry.list().map(mapToIndustryPreset);

export function getPersonaById(id: string): IndustryPreset {
  const raw = PersonaRegistry.get(id);
  return mapToIndustryPreset(raw);
}

export const DEFAULT_PERSONA: IndustryPreset = ALL_PERSONAS[0];
