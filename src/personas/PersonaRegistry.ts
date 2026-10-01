import { PersonaDefinition, RuntimePersonaContext } from './schema/persona.types';
import { PersonaValidator } from './schema/persona.validator';

import auraSalonRaw from './aura-salon.json';
import apexDentalRaw from './apex-dental.json';
import torqueMotorsRaw from './torque-motors.json';
import grandRealtyRaw from './grand-realty.json';
import vanguardLawRaw from './vanguard-law.json';
import bistroDiningRaw from './bistro-dining.json';
import coolbreezeHvacRaw from './coolbreeze-hvac.json';

const RAW_PERSONAS = [
  auraSalonRaw,
  apexDentalRaw,
  torqueMotorsRaw,
  grandRealtyRaw,
  vanguardLawRaw,
  bistroDiningRaw,
  coolbreezeHvacRaw,
];

export class PersonaRegistry {
  private static personas: Map<string, PersonaDefinition> = new Map();
  private static initialized = false;

  public static initialize(): void {
    if (this.initialized) return;

    for (const raw of RAW_PERSONAS) {
      const validation = PersonaValidator.validate(raw);
      if (!validation.valid) {
        console.error(`[PersonaRegistry] Validation failed for persona "${raw.id || 'unknown'}":`, validation.errors);
        throw new Error(`Invalid persona schema for ${raw.id}: ${validation.errors.join(', ')}`);
      }
      // Store frozen / immutable definition
      const definition = Object.freeze(raw as unknown as PersonaDefinition);
      this.personas.set(definition.id, definition);
    }

    this.initialized = true;
    console.log(`[PersonaRegistry] Successfully validated and registered ${this.personas.size} immutable personas.`);
  }

  public static get(personaId: string): PersonaDefinition {
    this.initialize();
    const persona = this.personas.get(personaId);
    if (!persona) {
      console.warn(`[PersonaRegistry] Persona "${personaId}" not found. Falling back to aura-salon.`);
      return this.personas.get('aura-salon')!;
    }
    return persona;
  }

  public static list(): PersonaDefinition[] {
    this.initialize();
    return Array.from(this.personas.values());
  }

  /**
   * Whether a persona id is one this registry actually serves.
   *
   * `get()` falls back to `aura-salon` for an unknown id, which is the right behaviour for
   * internal display paths that must not throw. It is the wrong behaviour for anything acting
   * on a caller-supplied value: the fallback is silent, so a caller asking for a persona that
   * does not exist is quietly given a different business, with that business's hours, prices
   * and services. Callers that must distinguish "unknown" from "resolved to the default" check
   * this first.
   */
  public static has(personaId: string): boolean {
    this.initialize();
    return this.personas.has(personaId);
  }

  public static getRuntimeContext(personaId: string, sessionId: string): RuntimePersonaContext {
    const definition = this.get(personaId);
    return {
      personaId: definition.id,
      version: definition.version,
      sessionId,
      definition,
      loadedAt: Date.now(),
    };
  }
}
