import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { getN8nClient } from '../n8n/N8nClientFactory';
import { FindAlternativeTimesOutput } from '../n8n/N8nClient';

export async function findAlternativeTimesTool(
  context: ToolExecutionContext,
  input: {
    serviceId?: string;
    date: string;
    partySize?: number;
    resourceId?: string;
  }
): Promise<ToolResult<FindAlternativeTimesOutput>> {
  const client = getN8nClient();
  const res = await client.findAlternativeTimes({
    personaId: context.personaId,
    serviceId: input.serviceId,
    date: input.date,
    partySize: input.partySize,
    resourceId: input.resourceId,
  });

  return {
    success: true,
    toolName: 'findAlternativeTimes',
    operationId: context.operationId,
    status: 'SUCCESS',
    data: res,
    executedAt: Date.now(),
  };
}
