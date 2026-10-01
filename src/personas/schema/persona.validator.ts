import { PersonaDefinition } from './persona.types';

export class PersonaValidator {
  public static validate(persona: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!persona || typeof persona !== 'object') {
      return { valid: false, errors: ['Persona must be a non-null object.'] };
    }

    if (!persona.id || typeof persona.id !== 'string') {
      errors.push('Missing or invalid "id" field.');
    }

    if (!persona.version || typeof persona.version !== 'string') {
      errors.push('Missing or invalid "version" field.');
    }

    if (!persona.identity || !persona.identity.businessName) {
      errors.push('Missing "identity.businessName".');
    }

    if (!persona.business || !persona.business.timezone) {
      errors.push('Missing "business.timezone" (e.g. America/New_York).');
    }

    if (!Array.isArray(persona.services) || persona.services.length === 0) {
      errors.push('"services" must be a non-empty array of ServiceItems.');
    }

    if (!persona.pricing || typeof persona.pricing.services !== 'object') {
      errors.push('Missing "pricing.services" map.');
    }

    if (!persona.hours || typeof persona.hours.schedule !== 'object') {
      errors.push('Missing "hours.schedule".');
    }

    if (!persona.contactPolicy || !Array.isArray(persona.contactPolicy.required)) {
      errors.push('Missing "contactPolicy.required" array.');
    }

    if (!persona.tools || !Array.isArray(persona.tools.allowed)) {
      errors.push('Missing "tools.allowed" array.');
    }

    if (!persona.safety || typeof persona.safety !== 'object') {
      errors.push('Missing "safety" policies object.');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
