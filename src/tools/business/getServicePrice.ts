import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { PersonaBusinessTruth, ServicePriceAnswer } from '../../personas/PersonaBusinessTruth';

export async function getServicePriceTool(
  context: ToolExecutionContext,
  input: { serviceName?: string; service?: string; query?: string }
): Promise<ToolResult<ServicePriceAnswer>> {
  const service = input.service || input.serviceName || input.query || '';
  const price = PersonaBusinessTruth.getServicePrice(context.personaId, service);

  if (!price.authoritative) {
    return {
      success: false,
      toolName: 'getServicePrice',
      operationId: context.operationId,
      status: 'FAILED',
      data: price,
      error: {
        code: 'NOT_FOUND',
        message:
          `Unknown service "${service}". Do not quote a price for this service. ` +
          `Say you do not have that information and offer to transfer or take a message.`,
      },
      executedAt: Date.now(),
    };
  }

  return {
    success: true,
    toolName: 'getServicePrice',
    operationId: context.operationId,
    status: 'SUCCESS',
    data: price,
    executedAt: Date.now(),
  };
}
