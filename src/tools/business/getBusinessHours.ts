import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { PersonaBusinessTruth, type BusinessHoursAnswer } from '../../personas/PersonaBusinessTruth';

/**
 * SECTION 09: Authoritative business hours.
 *
 * The previous implementation returned a hardcoded 8-7 / 9-5 / "Sunday closed
 * (emergency on-call)" schedule for every persona, in a fixed America/New_York timezone,
 * regardless of the business actually being asked about. Callers were told confidently
 * wrong opening hours.
 *
 * This now reads the schedule from the validated persona definition, evaluates it in the
 * BUSINESS timezone (not the server's), and reports honestly whether the business is open
 * right now.
 */
export async function getBusinessHoursTool(
  context: ToolExecutionContext
): Promise<ToolResult<BusinessHoursAnswer>> {
  const answer = PersonaBusinessTruth.getBusinessHours(context.personaId);

  return {
    success: true,
    toolName: 'getBusinessHours',
    operationId: context.operationId,
    status: 'SUCCESS',
    data: answer,
    executedAt: Date.now(),
  };
}
