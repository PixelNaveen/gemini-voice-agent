import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { PersonaBusinessTruth } from '../../personas/PersonaBusinessTruth';

/**
 * SECTION 09: Confirmation delivery.
 *
 * The previous implementation logged a line and returned `status: 'CONFIRMED'` with a
 * fabricated `messageId`. The agent would then tell the caller "I've emailed your
 * confirmation" when no email had ever been sent. That is a false commitment to a customer
 * about a real-world action, which is the single most damaging class of bug in this
 * codebase.
 *
 * This version only reports success when a real provider accepted the message. When no
 * provider is configured it returns an explicit UNAVAILABLE failure with copy that tells
 * the model NOT to claim anything was sent.
 */

export interface SendConfirmationInput {
  customerName: string;
  customerEmail: string;
  service: string;
  date: string;
  time: string;
}

export interface SendConfirmationResult {
  delivered: boolean;
  channel: 'EMAIL';
  recipient: string;
  /** Present only when a provider actually accepted the message. */
  providerMessageId?: string;
  provider: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function webhookUrl(): string | null {
  const url = process.env.AURA_CONFIRMATION_WEBHOOK_URL?.trim();
  return url && url.length > 0 ? url : null;
}

export async function sendConfirmationTool(
  context: ToolExecutionContext,
  input: SendConfirmationInput
): Promise<ToolResult<SendConfirmationResult>> {
  const fail = (
    code: 'VALIDATION_ERROR' | 'AUTHORIZATION_ERROR' | 'UNAVAILABLE' | 'INTEGRATION_ERROR',
    message: string,
    details?: Record<string, unknown>
  ): ToolResult<SendConfirmationResult> => ({
    success: false,
    toolName: 'sendConfirmation',
    operationId: context.operationId,
    status: 'FAILED',
    error: { code, message, ...(details ? { details } : {}) },
    executedAt: Date.now(),
  });

  const email = (input?.customerEmail ?? '').trim();
  if (!email || !EMAIL_RE.test(email)) {
    return fail('VALIDATION_ERROR', 'A valid customer email address is required to send a confirmation.');
  }
  if (!(input?.service ?? '').trim() || !(input?.date ?? '').trim() || !(input?.time ?? '').trim()) {
    return fail('VALIDATION_ERROR', 'Service, date and time are all required to send a confirmation.');
  }

  const url = webhookUrl();
  if (!url) {
    // Honest failure. The model is explicitly told what it may and may not say.
    return fail(
      'UNAVAILABLE',
      'No confirmation delivery provider is configured, so NO email was sent. ' +
        'Tell the caller the confirmation was NOT emailed and offer to take their details for a callback, ' +
        'or transfer to a staff member who can confirm manually. Never state that a confirmation was sent.'
    );
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        customerName: input.customerName,
        service: input.service,
        date: input.date,
        time: input.time,
        sessionId: context.sessionId,
        personaId: context.personaId,
        operationId: context.operationId,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return fail(
        'INTEGRATION_ERROR',
        `The confirmation provider rejected the message (HTTP ${response.status}). Do not claim it was sent.`,
        { httpStatus: response.status }
      );
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string; messageId?: string };
    const providerMessageId = body.id ?? body.messageId;

    console.log(
      `[sendConfirmation] Provider accepted confirmation for ${email} (${input.service} on ${input.date} ${input.time})`
    );

    return {
      success: true,
      toolName: 'sendConfirmation',
      operationId: context.operationId,
      status: 'CONFIRMED',
      data: {
        delivered: true,
        channel: 'EMAIL',
        recipient: email,
        ...(providerMessageId ? { providerMessageId } : {}),
        // The provider's *identity* is useful to the model ("an email was sent through our
        // mail provider"), but the URL is not. A webhook URL routinely carries a secret in
        // its path or query string, and this payload is returned to the model verbatim by
        // `toFunctionResponse`, which means it can be spoken to a caller or written into a
        // transcript. The host alone identifies the provider without exposing the credential.
        provider: new URL(url).host,
      },
      executedAt: Date.now(),
    };
  } catch (err: any) {
    return fail(
      'INTEGRATION_ERROR',
      `The confirmation provider could not be reached (${err?.message ?? 'unknown error'}). ` +
        'Do not claim the email was sent.'
    );
  }
}
