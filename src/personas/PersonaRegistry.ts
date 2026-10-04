import { PersonaDefinition } from './schema/persona.types';
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

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj as any)) {
    const val = (obj as any)[key];
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

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
      // Store deeply frozen / immutable definition
      const definition = deepFreeze(JSON.parse(JSON.stringify(raw)) as PersonaDefinition);
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

  public static has(personaId: string): boolean {
    this.initialize();
    return this.personas.has(personaId);
  }

  /**
   * For tests only: resets the registry state so tests can inject custom fixtures if needed.
   */
  public static _reset(): void {
    this.personas.clear();
    this.initialized = false;
  }
}
