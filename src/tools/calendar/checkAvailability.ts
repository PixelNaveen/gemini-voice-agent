import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { CalendarAdapter, AvailableSlot } from '../../integrations/calendar/CalendarAdapter';

export interface CheckAvailabilityInput {
  service: string;
  isoDate: string;
  preferredTime?: string;
}

export async function checkAvailabilityTool(
  context: ToolExecutionContext,
  input: CheckAvailabilityInput
): Promise<ToolResult<{ slots: AvailableSlot[]; requestedSlotAvailable: boolean }>> {
  if (!input.isoDate) {
    return {
      success: false,
      toolName: 'checkAvailability',
      operationId: context.operationId,
      status: 'FAILED',
      error: { code: 'VALIDATION_ERROR', message: 'Date is required to check availability.' },
      executedAt: Date.now(),
    };
  }

  const slots = CalendarAdapter.checkAvailability(context.personaId, input.isoDate, input.service || 'Haircut');
  const requestedSlotAvailable = input.preferredTime
    ? slots.some((s) => s.startTime === input.preferredTime || s.display.toLowerCase().includes(input.preferredTime!.toLowerCase()))
    : slots.length > 0;

  return {
    success: true,
    toolName: 'checkAvailability',
    operationId: context.operationId,
    status: requestedSlotAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
    data: {
      slots,
      requestedSlotAvailable,
    },
    executedAt: Date.now(),
  };
}
