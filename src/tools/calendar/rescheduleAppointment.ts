import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { getN8nClient } from '../n8n/N8nClientFactory';
import { RescheduleAppointmentOutput } from '../n8n/N8nClient';

export async function rescheduleAppointmentTool(
  context: ToolExecutionContext,
  input: {
    requestId?: string;
    confirmationCode: string;
    newDate: string;
    newStart: string;
    resourceId?: string;
  }
): Promise<ToolResult<RescheduleAppointmentOutput>> {
  const client = getN8nClient();
  const requestId = input.requestId || context.operationId;

  const res = await client.rescheduleAppointment({
    personaId: context.personaId,
    sessionId: context.sessionId,
    requestId,
    confirmationCode: input.confirmationCode,
    newDate: input.newDate,
    newStart: input.newStart,
    resourceId: input.resourceId,
  });

  if (!res.success) {
    return {
      success: false,
      toolName: 'rescheduleAppointment',
      operationId: context.operationId,
      status: 'FAILED',
      error: {
        code: (res.errorCode as any) || 'CONFLICT',
        message: res.message || 'Failed to reschedule appointment.',
      },
      data: res,
      executedAt: Date.now(),
    };
  }

  return {
    success: true,
    toolName: 'rescheduleAppointment',
    operationId: context.operationId,
    status: 'SUCCESS',
    data: res,
    executedAt: Date.now(),
  };
}
