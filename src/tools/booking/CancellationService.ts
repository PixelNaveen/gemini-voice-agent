import { PersonaRegistry } from '../../personas/PersonaRegistry';
import { CalendarAdapter } from '../../integrations/calendar/CalendarAdapter';

export class CancellationService {
  public static cancel(params: {
    personaId: string;
    appointmentId?: string;
    customerEmail?: string;
    now?: Date;
  }): { success: boolean; message: string; requiresHuman?: boolean } {
    const persona = PersonaRegistry.get(params.personaId);
    const minNoticeHours = persona.policies.cancellation.minimumNoticeHours;
    const now = params.now || new Date();

    if (params.appointmentId) {
      const success = CalendarAdapter.cancelAppointment(params.appointmentId);
      return {
        success,
        message: success
          ? 'Your appointment has been cancelled.'
          : 'Appointment ID not found in active calendar.',
      };
    }

    if (params.customerEmail) {
      const apts = CalendarAdapter.getAppointmentsForCustomer(params.customerEmail);
      if (apts.length === 0) {
        return {
          success: false,
          message: `No active appointments found for email ${params.customerEmail}.`,
        };
      }

      const targetApt = apts[0];
      const aptDate = new Date(`${targetApt.date}T${targetApt.startTime}:00`);
      const hoursUntil = (aptDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntil < minNoticeHours && hoursUntil > 0) {
        return {
          success: false,
          requiresHuman: true,
          message: `Cancellations require at least ${minNoticeHours} hours notice. Please speak with the front desk.`,
        };
      }

      CalendarAdapter.cancelAppointment(targetApt.id);
      return {
        success: true,
        message: `Your appointment for ${targetApt.service} on ${targetApt.date} at ${targetApt.startTime} has been cancelled.`,
      };
    }

    return {
      success: false,
      message: 'Please provide your appointment ID or email address to cancel.',
    };
  }
}
