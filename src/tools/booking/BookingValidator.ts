import { PersonaRegistry } from '../../personas/PersonaRegistry';
import { BusinessHours, SchedulingPolicy } from '../../core/time';

export interface BookingValidationResult {
  valid: boolean;
  errors: string[];
}

export class BookingValidator {
  public static validate(params: {
    personaId: string;
    service?: string;
    isoDate?: string;
    time24?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    vehicleInfo?: string;
    partySize?: number;
  }): BookingValidationResult {
    const errors: string[] = [];
    const persona = PersonaRegistry.get(params.personaId);

    // 1. Service Check
    if (!params.service) {
      errors.push('Service selection is required.');
    }

    // 2. Date & Time Check
    if (!params.isoDate) {
      errors.push('Appointment date is required.');
    }
    if (!params.time24) {
      errors.push('Appointment time is required.');
    }

    // 3. Operating Hours & Policy Validation
    if (params.isoDate && params.time24) {
      const openCheck = BusinessHours.isOpenAt(params.isoDate, params.time24, params.personaId);
      if (!openCheck.isOpen) {
        errors.push(openCheck.reason || 'Requested time is outside business operating hours.');
      }

      const policyCheck = SchedulingPolicy.validateRequest(
        params.isoDate,
        params.time24,
        params.service || 'General',
        params.personaId
      );
      if (!policyCheck.valid) {
        errors.push(policyCheck.error || 'Requested time violates scheduling advance notice rules.');
      }
    }

    // 4. Contact Policy Requirements
    const contactReqs = persona.contactPolicy.required;

    if (contactReqs.includes('name') && !params.customerName) {
      errors.push('Caller name is required.');
    }

    if (contactReqs.includes('email')) {
      if (!params.customerEmail) {
        errors.push('Caller email is required.');
      } else if (!params.customerEmail.includes('@') || !params.customerEmail.includes('.')) {
        errors.push('Caller email must be a valid email address format.');
      }
    }

    if (contactReqs.includes('phone') && !params.customerPhone) {
      errors.push('Caller phone number is required.');
    }

    if (contactReqs.includes('vehicleInfo') && !params.vehicleInfo) {
      errors.push('Vehicle make and model information is required.');
    }

    if (contactReqs.includes('partySize') && (!params.partySize || params.partySize <= 0)) {
      errors.push('Party size is required for table reservations.');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
