import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { getN8nClient } from '../n8n/N8nClientFactory';
import { CancelAppointmentOutput } from '../n8n/N8nClient';

export async function cancelAppointmentTool(
  context: ToolExecutionContext,
  input: {
    requestId?: string;
    confirmationCode: string;
    confirmed: boolean;
  }
): Promise<ToolResult<CancelAppointmentOutput>> {
  const client = getN8nClient();
  const requestId = input.requestId || context.operationId;

  const res = await client.cancelAppointment({
    personaId: context.personaId,
    sessionId: context.sessionId,
    requestId,
    confirmationCode: input.confirmationCode,
    confirmed: Boolean(input.confirmed),
  });

  if (!res.success) {
    return {
      success: false,
      toolName: 'cancelAppointment',
      operationId: context.operationId,
      status: 'FAILED',
      error: {
        code: (res.errorCode as any) || 'CONFLICT',
        message: res.message || 'Failed to cancel appointment.',
      },
      data: res,
      executedAt: Date.now(),
    };
  }

  return {
    success: true,
    toolName: 'cancelAppointment',
    operationId: context.operationId,
    status: 'SUCCESS',
    data: res,
    executedAt: Date.now(),
  };
}
