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
    } else {
      for (const s of persona.services) {
        if (!s.id || typeof s.id !== 'string') errors.push(`Service missing id: ${JSON.stringify(s)}`);
        if (!s.name || typeof s.name !== 'string') errors.push(`Service ${s.id || 'unnamed'} missing name.`);
        if (typeof s.durationMinutes !== 'number') errors.push(`Service ${s.id || 'unnamed'} missing durationMinutes.`);
        if (!s.priceType || typeof s.priceType !== 'string') errors.push(`Service ${s.id || 'unnamed'} missing priceType.`);
        if (!Array.isArray(s.aliases)) errors.push(`Service ${s.id || 'unnamed'} missing aliases array.`);
      }
    }

    if (!Array.isArray(persona.resources) || persona.resources.length === 0) {
      errors.push('"resources" must be a non-empty array of ResourceConfigs.');
    }

    if (!persona.hours || typeof persona.hours.schedule !== 'object') {
      errors.push('Missing "hours.schedule".');
    }

    if (!persona.contactPolicy || !Array.isArray(persona.contactPolicy.required)) {
      errors.push('Missing "contactPolicy.required" array.');
    }

    if (!persona.booking || typeof persona.booking !== 'object') {
      errors.push('Missing "booking" configuration.');
    }

    if (!persona.tools || !Array.isArray(persona.tools.allowed)) {
      errors.push('Missing "tools.allowed" array.');
    }

    if (!persona.escalation || !Array.isArray(persona.escalation.triggers)) {
      errors.push('Missing "escalation.triggers" array.');
    } else {
      for (const t of persona.escalation.triggers) {
        if (!t.id || typeof t.id !== 'string') errors.push(`Escalation trigger missing id.`);
        if (!Array.isArray(t.detectKeywords)) errors.push(`Escalation trigger ${t.id || 'unnamed'} missing detectKeywords.`);
        if (!t.action || typeof t.action !== 'string') errors.push(`Escalation trigger ${t.id || 'unnamed'} missing action.`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
