import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { PersonaBusinessTruth, type ServicePriceAnswer } from '../../personas/PersonaBusinessTruth';

/**
 * SECTION 09: Authoritative pricing.
 *
 * The previous implementation carried its own hardcoded price table that had drifted out
 * of sync with the persona registry, and it answered for a dental or auto caller using the
 * salon catalogue whenever the persona id was not one of three hardcoded strings. It also
 * reported `isAuthoritative: true` for a lookup that had actually failed, and returned the
 * string "Quote provided upon consultation" as though that were a price.
 *
 * Pricing is now read from the persona's own `pricing.services` table, and an unknown
 * service returns `authoritative: false` with a null price so the agent tells the caller it
 * does not know rather than inventing a number.
 */
export async function getServicePriceTool(
  context: ToolExecutionContext,
  input: { service: string }
): Promise<ToolResult<ServicePriceAnswer>> {
  const answer = PersonaBusinessTruth.getServicePrice(context.personaId, input?.service ?? '');

  if (!answer.authoritative) {
    return {
      success: false,
      toolName: 'getServicePrice',
      operationId: context.operationId,
      status: 'FAILED',
      data: answer,
      error: {
        code: 'NOT_FOUND',
        message: `No published price for "${input?.service ?? ''}". Do not quote a price; offer a callback or transfer.`,
        details: { availableServices: answer.availableServices ?? [] },
      },
      executedAt: Date.now(),
    };
  }

  return {
    success: true,
    toolName: 'getServicePrice',
    operationId: context.operationId,
    status: 'SUCCESS',
    data: answer,
    executedAt: Date.now(),
  };
}
