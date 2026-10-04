import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { PersonaBusinessTruth } from '../../personas/PersonaBusinessTruth';

/**
 * SECTION 09: Call transfer.
 *
 * The previous implementation returned `transferred: true`, a made-up `queuePosition: 1`,
 * and a random 4-digit `transferCode`, so the agent announced the caller was being
 * transferred to a supervisor who was in fact never contacted.
 *
 * A transfer is only reported as successful when a real telephony endpoint accepted it.
 * Without one, the honest result is UNAVAILABLE, and the model is told to offer a callback
 * instead of leaving the caller on an indefinite hold.
 */

export interface TransferCallInput {
  reason: 'CUSTOMER_REQUEST' | 'EMERGENCY' | 'COMPLEX_INQUIRY';
  department?: string;
  summary?: string;
}

export interface TransferCallResult {
  transferred: boolean;
  department: string;
  /** Only present on a real, accepted transfer. */
  transferCode?: string;
  provider: string;
}

function transferEndpoint(): string | null {
  const url = process.env.AURA_TRANSFER_WEBHOOK_URL?.trim();
  return url && url.length > 0 ? url : null;
}

export async function transferCallTool(
  context: ToolExecutionContext,
  input: TransferCallInput
): Promise<ToolResult<TransferCallResult>> {
  const fail = (
    code: 'VALIDATION_ERROR' | 'AUTHORIZATION_ERROR' | 'UNAVAILABLE' | 'INTEGRATION_ERROR',
    message: string,
    details?: Record<string, unknown>
  ): ToolResult<TransferCallResult> => ({
    success: false,
    toolName: 'transferCall',
    operationId: context.operationId,
    status: 'FAILED',
    error: { code, message, ...(details ? { details } : {}) },
    executedAt: Date.now(),
  });

  const escalation = PersonaBusinessTruth.getBookingPolicy(context.personaId).escalation;
  if (!escalation) {
    return fail(
      'UNAVAILABLE',
      `The ${context.personaId} persona has no escalation department configured, so no transfer is possible. ` +
        'Offer to take a callback message instead. Never claim a transfer is happening.'
    );
  }

  const reason = input?.reason;
  if (reason !== 'CUSTOMER_REQUEST' && reason !== 'EMERGENCY' && reason !== 'COMPLEX_INQUIRY') {
    return fail('VALIDATION_ERROR', 'A valid transfer reason is required (CUSTOMER_REQUEST, EMERGENCY, COMPLEX_INQUIRY).');
  }
  if (reason === 'EMERGENCY' && !escalation.emergencyTransfer) {
    return fail(
      'AUTHORIZATION_ERROR',
      'This persona does not permit emergency transfers. Advise the caller to call emergency services directly.'
    );
  }

  const department = (input?.department ?? escalation.defaultDepartment).trim();
  if (!department) {
    return fail('VALIDATION_ERROR', 'No transfer department could be resolved for this persona.');
  }

  const url = transferEndpoint();
  if (!url) {
    return fail(
      'UNAVAILABLE',
      `No telephony transfer provider is configured, so the call was NOT transferred to ${department}. ` +
        'Tell the caller you will take a callback message and confirm their preferred contact details. ' +
        'Never tell the caller they are being transferred or give them a transfer code.'
    );
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: context.sessionId,
        personaId: context.personaId,
        department,
        reason,
        summary: input?.summary ?? '',
        operationId: context.operationId,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return fail(
        'INTEGRATION_ERROR',
        `The telephony provider rejected the transfer to ${department} (HTTP ${response.status}). ` +
          'Do not tell the caller the transfer succeeded.',
        { httpStatus: response.status }
      );
    }

    const body = (await response.json().catch(() => ({}))) as { transferCode?: string; code?: string };
    const transferCode = body.transferCode ?? body.code;

    console.log(`[transferCall] Provider accepted transfer to ${department} (reason: ${reason})`);

    return {
      success: true,
      toolName: 'transferCall',
      operationId: context.operationId,
      status: 'SUCCESS',
      data: {
        transferred: true,
        department,
        ...(transferCode ? { transferCode } : {}),
        // Host, not the full URL. This payload goes back to the model verbatim, and a
        // telephony webhook URL routinely carries a credential in its path or query string
        // that must not be spoken to a caller or written into a transcript.
        provider: new URL(url).host,
      },
      executedAt: Date.now(),
    };
  } catch (err: any) {
    return fail(
      'INTEGRATION_ERROR',
      `The telephony provider could not be reached (${err?.message ?? 'unknown error'}). ` +
        'Do not tell the caller the transfer succeeded.'
    );
  }
}
