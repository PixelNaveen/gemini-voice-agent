import { PersonaRegistry } from '../../personas/PersonaRegistry';
import type { PersonaDefinition } from '../../personas/schema/persona.types';

export type RequirementLevel = 'required' | 'optional';

export interface PersonaRequirementPolicy {
  name: RequirementLevel;
  email: RequirementLevel;
  phone: RequirementLevel;
  service: RequirementLevel;
  date: RequirementLevel;
  time: RequirementLevel;
  partySize?: RequirementLevel;
  vehicleInfo?: RequirementLevel;
  location?: RequirementLevel;
}

/**
 * F-08: booking requirements are read from the persona, not from a second list.
 *
 * This used to be a hand-maintained `Record<string, PersonaRequirementPolicy>` keyed by
 * persona id. Three of its five keys (`precision-auto`, `vanguard-realestate`,
 * `lumina-dining`) were ids that do not exist in the registry, so five of the seven real
 * personas silently fell through to the default branch: the agent was never asked to
 * collect a vehicle description for the auto shop, never asked for a party size at the
 * restaurant, and never asked for a phone number for four businesses whose own
 * `contactPolicy` marks it required. `BookingValidator` - the code that actually refuses
 * the booking - reads `persona.contactPolicy.required` directly, so the two disagreed and
 * the conversation was guided into a rejection.
 *
 * The persona definition is the only authority for what a booking requires, so it is now
 * also the only authority here. A new persona cannot drift, because there is nothing to
 * add: dropping the persona JSON into the registry is sufficient.
 */
const CONTACT_FIELDS = [
  'name',
  'email',
  'phone',
  'service',
  'date',
  'time',
  'partySize',
  'vehicleInfo',
  'location',
] as const;

const ALL_OPTIONAL: PersonaRequirementPolicy = {
  name: 'optional',
  email: 'optional',
  phone: 'optional',
  service: 'optional',
  date: 'optional',
  time: 'optional',
  partySize: 'optional',
  vehicleInfo: 'optional',
  location: 'optional',
};

/**
 * Projects a persona definition onto the requirement shape the conversation layer uses.
 * `partySize`, `vehicleInfo` and `location` are only present when the persona mentions
 * them at all, so "this business never asks" stays distinguishable from "optional".
 */
export function policyFromPersona(persona: PersonaDefinition): PersonaRequirementPolicy {
  // Persona JSON is authored by hand, so field casing is compared case-insensitively.
  const required = new Set<string>(
    (persona.contactPolicy?.required ?? []).map((field) => String(field).toLowerCase())
  );
  if (required.size === 0) {
    return { ...ALL_OPTIONAL };
  }
  const optional = new Set<string>(
    (persona.contactPolicy?.optional ?? []).map((field) => String(field).toLowerCase())
  );

  const policy: PersonaRequirementPolicy = {
    name: 'optional',
    email: 'optional',
    phone: 'optional',
    service: 'optional',
    date: 'optional',
    time: 'optional',
  };

  for (const field of CONTACT_FIELDS) {
    const level: RequirementLevel = required.has(field.toLowerCase()) ? 'required' : 'optional';
    if (field === 'partySize' || field === 'vehicleInfo' || field === 'location') {
      if (required.has(field.toLowerCase()) || optional.has(field.toLowerCase())) {
        policy[field] = level;
      }
    } else {
      policy[field] = level;
    }
  }

  return policy;
}

/**
 * Resolves the booking requirements for a persona id.
 *
 * An unknown id resolves exactly as it does everywhere else in the system - through
 * `PersonaRegistry`, which falls back to the default persona and warns. This is a
 * conversation-shaping hint, not an authority: it never decides whether a booking is
 * valid, so a fallback here degrades the questions asked rather than the facts stated.
 */
export function getRequirementPolicyForPersona(personaId: string): PersonaRequirementPolicy {
  return policyFromPersona(PersonaRegistry.get(personaId));
}
