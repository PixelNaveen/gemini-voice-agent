import { ConversationEntities } from './EntityModel';
import { getRequirementPolicyForPersona, PersonaRequirementPolicy } from './RequirementPolicy';

export interface MissingInfoAnalysis {
  knownConfirmed: string[];
  tentativeNeedsVerification: string[];
  missingRequired: string[];
  nextMissingField: string | null;
  guidancePrompt: string | null;
}

export class MissingInfoResolver {
  public static analyze(
    entities: ConversationEntities,
    personaId: string,
    intent = 'BOOKING'
  ): MissingInfoAnalysis {
    const policy = getRequirementPolicyForPersona(personaId);
    const knownConfirmed: string[] = [];
    const tentativeNeedsVerification: string[] = [];
    const missingRequired: string[] = [];

    // Helper checking
    const checkField = (fieldName: keyof PersonaRequirementPolicy, entityObj: any) => {
      const isRequired = policy[fieldName] === 'required';
      if (!entityObj || !entityObj.value) {
        if (isRequired) missingRequired.push(fieldName as string);
      } else if (entityObj.status === 'CONFIRMED') {
        knownConfirmed.push(fieldName as string);
      } else if (entityObj.status === 'TENTATIVE') {
        tentativeNeedsVerification.push(fieldName as string);
      }
    };

    if (intent === 'BOOKING' || intent === 'RESCHEDULING') {
      checkField('service', entities.service);
      checkField('date', entities.date);
      checkField('time', entities.time);
      checkField('name', entities.customerName);
      checkField('email', entities.email);
      checkField('phone', entities.phone);
      if (policy.partySize === 'required') checkField('partySize', entities.partySize);
      if (policy.vehicleInfo === 'required') checkField('vehicleInfo', entities.vehicleInfo);
    }

    const nextMissingField = missingRequired.length > 0 ? missingRequired[0] : null;

    let guidancePrompt: string | null = null;
    if (nextMissingField) {
      switch (nextMissingField) {
        case 'service':
          guidancePrompt = 'Ask what specific service or treatment the caller would like to schedule.';
          break;
        case 'date':
          guidancePrompt = 'Ask what day or date works best for their appointment.';
          break;
        case 'time':
          guidancePrompt = 'Ask what time of day they prefer (e.g. morning, afternoon, or specific hour).';
          break;
        case 'name':
          guidancePrompt = 'Naturally ask for the caller’s name for the reservation.';
          break;
        case 'email':
          guidancePrompt = 'Ask for their email address for the appointment confirmation.';
          break;
        case 'phone':
          guidancePrompt = 'Ask for a phone number where we can reach them if needed.';
          break;
        case 'partySize':
          guidancePrompt = 'Ask how many guests will be in their party.';
          break;
        case 'vehicleInfo':
          guidancePrompt = 'Ask for the make, model, and year of their vehicle.';
          break;
      }
    }

    return {
      knownConfirmed,
      tentativeNeedsVerification,
      missingRequired,
      nextMissingField,
      guidancePrompt,
    };
  }
}
