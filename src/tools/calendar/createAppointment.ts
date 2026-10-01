import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { BookingService, ExecuteBookingInput } from '../booking/BookingService';
import { AppointmentRecord } from '../../integrations/calendar/CalendarAdapter';

export interface CreateAppointmentInput {
  service: string;
  date: string;
  startTime: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  vehicleInfo?: string;
  partySize?: number;
}

export async function createAppointmentTool(
  context: ToolExecutionContext,
  input: CreateAppointmentInput
): Promise<ToolResult<{ appointment: AppointmentRecord }>> {
  const bookingInput: ExecuteBookingInput = {
    service: input.service,
    isoDate: input.date,
    time24: input.startTime,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    vehicleInfo: input.vehicleInfo,
    partySize: input.partySize,
  };

  return BookingService.executeBooking(context, bookingInput);
}
