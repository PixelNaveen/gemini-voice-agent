import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { CancellationService } from '../booking/CancellationService';

export interface CancelAppointmentInput {
  appointmentId?: string;
  customerEmail?: string;
}

export async function cancelAppointmentTool(
  context: ToolExecutionContext,
  input: CancelAppointmentInput
): Promise<ToolResult<{ cancelled: boolean; message: string; requiresHuman?: boolean }>> {
  const result = CancellationService.cancel({
    personaId: context.personaId,
    appointmentId: input.appointmentId,
    customerEmail: input.customerEmail,
  });

  return {
    success: result.success,
    toolName: 'cancelAppointment',
    operationId: context.operationId,
    status: result.success ? 'SUCCESS' : 'FAILED',
    data: {
      cancelled: result.success,
      message: result.message,
      requiresHuman: result.requiresHuman,
    },
    error: !result.success ? { code: 'INTEGRATION_ERROR', message: result.message } : undefined,
    executedAt: Date.now(),
  };
}
