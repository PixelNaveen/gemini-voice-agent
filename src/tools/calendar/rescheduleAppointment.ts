import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { RescheduleService } from '../booking/RescheduleService';
import { AppointmentRecord } from '../../integrations/calendar/CalendarAdapter';

export interface RescheduleAppointmentInput {
  customerEmail: string;
  newDate: string;
  newTime: string;
  service?: string;
}

export async function rescheduleAppointmentTool(
  context: ToolExecutionContext,
  input: RescheduleAppointmentInput
): Promise<ToolResult<{ appointment: AppointmentRecord }>> {
  if (!input.customerEmail || !input.newDate || !input.newTime) {
    return {
      success: false,
      toolName: 'rescheduleAppointment',
      operationId: context.operationId,
      status: 'FAILED',
      error: { code: 'VALIDATION_ERROR', message: 'Missing customer email, new date, or new time.' },
      executedAt: Date.now(),
    };
  }

  const result = RescheduleService.reschedule({
    personaId: context.personaId,
    customerEmail: input.customerEmail,
    newDate: input.newDate,
    newTime: input.newTime,
    service: input.service,
    idempotencyKey: context.idempotencyKey || `${context.sessionId}_reschedule_${context.operationId}`,
  });

  if (!result.success || !result.newAppointment) {
    return {
      success: false,
      toolName: 'rescheduleAppointment',
      operationId: context.operationId,
      status: 'FAILED',
      error: { code: 'CONFLICT', message: result.error || 'Failed to reschedule appointment.' },
      executedAt: Date.now(),
    };
  }

  return {
    success: true,
    toolName: 'rescheduleAppointment',
    operationId: context.operationId,
    status: 'CONFIRMED',
    data: { appointment: result.newAppointment },
    executedAt: Date.now(),
  };
}
