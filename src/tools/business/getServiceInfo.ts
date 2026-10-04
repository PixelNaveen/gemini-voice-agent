import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { PersonaBusinessTruth, ServiceInfoAnswer } from '../../personas/PersonaBusinessTruth';

export async function getServiceInfoTool(
  context: ToolExecutionContext,
  input: { query?: string; serviceName?: string; serviceId?: string }
): Promise<ToolResult<ServiceInfoAnswer>> {
  const query = input.query || input.serviceName || input.serviceId || '';
  const answer = PersonaBusinessTruth.getServiceInfo(context.personaId, query);

  return {
    success: true,
    toolName: 'getServiceInfo',
    operationId: context.operationId,
    status: 'SUCCESS',
    data: answer,
    executedAt: Date.now(),
  };
}
