import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { getN8nClient } from '../n8n/N8nClientFactory';
import { CheckAvailabilityOutput } from '../n8n/N8nClient';

export async function checkAvailabilityTool(
  context: ToolExecutionContext,
  input: {
    serviceId?: string;
    date: string;
    time?: string;
    window?: { start: string; end: string };
    partySize?: number;
    resourceId?: string;
    nextWeekdayPolicy?: 'ask' | 'upcoming' | 'following_week';
  }
): Promise<ToolResult<CheckAvailabilityOutput>> {
  const client = getN8nClient();
  const res = await client.checkAvailability({
    personaId: context.personaId,
    serviceId: input.serviceId,
    date: input.date,
    time: input.time,
    window: input.window,
    partySize: input.partySize,
    resourceId: input.resourceId,
    nextWeekdayPolicy: input.nextWeekdayPolicy,
  });

  return {
    success: true,
    toolName: 'checkAvailability',
    operationId: context.operationId,
    status: 'SUCCESS',
    data: res,
    executedAt: Date.now(),
  };
}
