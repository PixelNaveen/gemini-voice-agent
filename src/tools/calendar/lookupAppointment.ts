import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { getN8nClient } from '../n8n/N8nClientFactory';
import { LookupAppointmentOutput } from '../n8n/N8nClient';

export async function lookupAppointmentTool(
  context: ToolExecutionContext,
  input: {
    confirmationCode?: string;
  }
): Promise<ToolResult<LookupAppointmentOutput>> {
  const client = getN8nClient();
  const res = await client.lookupAppointment({
    personaId: context.personaId,
    sessionId: context.sessionId,
    confirmationCode: input.confirmationCode,
  });

  return {
    success: true,
    toolName: 'lookupAppointment',
    operationId: context.operationId,
    status: 'SUCCESS',
    data: res,
    executedAt: Date.now(),
  };
}
