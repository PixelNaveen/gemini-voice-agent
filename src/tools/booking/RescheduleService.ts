import { CalendarAdapter, AppointmentRecord } from '../../integrations/calendar/CalendarAdapter';
import { BookingValidator } from './BookingValidator';

export class RescheduleService {
  /**
   * Reschedules an appointment transactionally: verifies new slot before cancelling old slot.
   */
  public static reschedule(params: {
    personaId: string;
    customerEmail: string;
    newDate: string;
    newTime: string;
    service?: string;
    idempotencyKey?: string;
  }): { success: boolean; newAppointment?: AppointmentRecord; error?: string } {
    // 1. Locate existing appointment
    const existingList = CalendarAdapter.getAppointmentsForCustomer(params.customerEmail);
    if (existingList.length === 0) {
      return { success: false, error: 'No active appointment found for this customer email.' };
    }

    const oldApt = existingList[0];
    const serviceName = params.service || oldApt.service;

    // 2. Validate new date/time request
    const validation = BookingValidator.validate({
      personaId: params.personaId,
      service: serviceName,
      isoDate: params.newDate,
      time24: params.newTime,
      customerEmail: params.customerEmail,
      customerName: oldApt.customerName,
    });

    if (!validation.valid) {
      return { success: false, error: validation.errors.join(' ') };
    }

    // 3. Atomically attempt booking the NEW slot first
    const createResult = CalendarAdapter.createAppointment({
      personaId: params.personaId,
      customerName: oldApt.customerName,
      customerEmail: params.customerEmail,
      customerPhone: oldApt.customerPhone,
      service: serviceName,
      date: params.newDate,
      startTime: params.newTime,
      idempotencyKey: params.idempotencyKey,
      timezone: oldApt.timezone,
    });

    if (!createResult.success || !createResult.appointment) {
      return {
        success: false,
        error: createResult.error || 'Requested reschedule slot is unavailable. Original appointment preserved.',
      };
    }

    // 4. Safely cancel the old appointment ONLY after new booking succeeded
    CalendarAdapter.cancelAppointment(oldApt.id);

    return {
      success: true,
      newAppointment: createResult.appointment,
    };
  }
}
