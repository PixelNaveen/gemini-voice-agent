import { ToolGateway } from './ToolGateway';
import type { ToolError } from './ToolTypes';

/**
 * SECTION 09: Gemini Live function declarations.
 *
 * The tools were implemented and unit-tested, but the live session was never told they
 * existed. Without `tools` in the session config the model has no way to reach
 * `ToolGateway`, so a caller asking for an appointment got a confident spoken answer with no
 * calendar behind it. That is the most serious form of the F-22/F-09 problem: a fabricated
 * booking that no code path could have prevented, because no code path ran.
 *
 * Two rules govern this file.
 *
 * 1. **Declarations are generated from the real registry.** A hand-written list of tools
 *    would drift from `ToolGateway` and could advertise a capability the server cannot
 *    honestly perform, which is the exact fabrication this project is built to avoid.
 * 2. **Arguments are validated before execution.** The model produces these argument
 *    objects, so they are untrusted input regardless of who asked. A malformed call must
 *    produce a spoken apology, never a crash and never a fabricated success.
 */

/** JSON Schema for each tool's arguments, mirroring the real tool input types. */
const TOOL_SCHEMAS: Record<string, { parameters: Record<string, unknown>; description: string }> = {
  checkAvailability: {
    description: 'Look up genuinely open appointment slots for a service on a given date.',
    parameters: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'The service name, e.g. "Haircut".' },
        isoDate: { type: 'string', description: 'Calendar date in YYYY-MM-DD form.' },
        preferredTime: { type: 'string', description: 'Optional preferred time of day, e.g. "14:00".' },
      },
      required: ['isoDate'],
    },
  },
  createAppointment: {
    description: 'Book an appointment. Only call this after the caller has explicitly confirmed.',
    parameters: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'The service name.' },
        isoDate: { type: 'string', description: 'Calendar date in YYYY-MM-DD form.' },
        time: { type: 'string', description: 'Start time in HH:MM form.' },
        customerName: { type: 'string', description: "The caller's full name." },
        phone: { type: 'string', description: "The caller's phone number." },
        email: { type: 'string', description: "The caller's email address, if given." },
      },
      required: ['service', 'isoDate', 'time', 'customerName'],
    },
  },
  cancelAppointment: {
    description: 'Cancel an existing appointment.',
    parameters: {
      type: 'object',
      properties: {
        isoDate: { type: 'string', description: 'Calendar date of the appointment in YYYY-MM-DD form.' },
        time: { type: 'string', description: 'Start time in HH:MM form.' },
      },
      required: ['isoDate', 'time'],
    },
  },
  rescheduleAppointment: {
    description: 'Move an existing appointment to a new time.',
    parameters: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Current date in YYYY-MM-DD form.' },
        fromTime: { type: 'string', description: 'Current start time in HH:MM form.' },
        toDate: { type: 'string', description: 'New date in YYYY-MM-DD form.' },
        toTime: { type: 'string', description: 'New start time in HH:MM form.' },
      },
      required: ['fromDate', 'fromTime', 'toDate', 'toTime'],
    },
  },
  getBusinessHours: {
    description: "Get the business's opening hours for a given day.",
    parameters: {
      type: 'object',
      properties: { day: { type: 'string', description: 'Day name or YYYY-MM-DD date.' } },
      required: ['day'],
    },
  },
  getServicePrice: {
    description: 'Get the price of a service.',
    parameters: {
      type: 'object',
      properties: { service: { type: 'string', description: 'The service name.' } },
      required: ['service'],
    },
  },
  sendConfirmation: {
    description: 'Send a booking confirmation to the caller. Requires a configured provider.',
    parameters: {
      type: 'object',
      properties: {
        isoDate: { type: 'string', description: 'Appointment date in YYYY-MM-DD form.' },
        time: { type: 'string', description: 'Appointment time in HH:MM form.' },
      },
      required: ['isoDate', 'time'],
    },
  },
  transferCall: {
    description: 'Transfer the caller to a human. Requires a configured provider.',
    parameters: { type: 'object', properties: { reason: { type: 'string', description: 'Why the caller is being transferred.' } } },
  },
};

/**
 * Builds the `tools` array for a persona's live session.
 *
 * Only tools that are genuinely implemented *and* genuinely runnable on this deployment are
 * declared. Advertising a side-effecting tool whose provider is not configured would let the
 * model promise a confirmation or a transfer that cannot happen, so `hasLiveProvider` is
 * checked here rather than letting the model discover the failure mid-call.
 */
export function buildToolDeclarations(personaId: string, persona: { tools: { allowed: string[] } }): Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  const declarations: Array<{ name: string; description: string; parameters: Record<string, unknown> }> = [];

  for (const toolName of persona.tools.allowed) {
    if (!ToolGateway.isImplemented(toolName)) continue;
    if (!ToolGateway.hasLiveProvider(toolName)) continue;
    const schema = TOOL_SCHEMAS[toolName];
    if (!schema) continue;
    declarations.push({ name: toolName, description: schema.description, parameters: schema.parameters });
  }

  // A persona that declares tools but resolves to none is a configuration fault, not a
  // silent no-op. It is surfaced at boot by PersonaBusinessTruth, and logging here means the
  // reason is visible when a deployment misbehaves in production.
  if (declarations.length === 0 && persona.tools.allowed.length > 0) {
    console.warn(
      `[FunctionCalling] Persona "${personaId}" allows ${persona.tools.allowed.length} tool(s) ` +
        `but none are both implemented and runnable here; the model will have no tools this call.`
    );
  }
  return declarations;
}

/**
 * Validates model-produced arguments against the tool's schema.
 *
 * The model is generating these, so it will occasionally produce a string where a number is
 * declared, omit a required field, or send an entirely wrong shape. Passing that straight to
 * a booking tool is how a malformed call becomes a real appointment at a nonsense time.
 *
 * Only the constraints that actually protect a side effect are enforced: required fields and
 * primitive type. The provider does deeper validation, and duplicating it here would create
 * two definitions of the same rule.
 */
export function validateToolArguments(
  toolName: string,
  args: unknown
): { valid: true; value: Record<string, any> } | { valid: false; reason: string } {
  const schema = TOOL_SCHEMAS[toolName];
  if (!schema) return { valid: false, reason: `Tool "${toolName}" has no known argument schema.` };

  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    return { valid: false, reason: `Tool "${toolName}" requires an object of named arguments.` };
  }
  const value = args as Record<string, any>;
  const properties = (schema.parameters.properties ?? {}) as Record<string, { type: string }>;
  const required = (schema.parameters.required ?? []) as string[];

  for (const field of required) {
    const v = value[field];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      return { valid: false, reason: `Tool "${toolName}" is missing the required argument "${field}".` };
    }
  }

  for (const [field, spec] of Object.entries(properties)) {
    const v = value[field];
    if (v === undefined || v === null) continue;
    if (spec.type === 'string' && typeof v !== 'string') {
      return { valid: false, reason: `Tool "${toolName}" argument "${field}" must be a string.` };
    }
    if (spec.type === 'number' && typeof v !== 'number') {
      return { valid: false, reason: `Tool "${toolName}" argument "${field}" must be a number.` };
    }
  }

  return { valid: true, value };
}

/**
 * Turns a `ToolResult` into the payload handed back to the model.
 *
 * On failure the `spokenMessage` from the error taxonomy is included so the model has a
 * caller-safe line available. Without it the model tends to improvise around a failure, which
 * is how a provider outage gets spoken as a statement about the calendar.
 */
/**
 * Builds the function response the model reads back.
 *
 * Two audiences are being served at once, and conflating them is a real hazard. The *model*
 * needs to know what happened and what it is forbidden to claim; the *caller* needs a line
 * that is safe to say out loud. Substituting one for the other loses something real: sending
 * the caller-safe line alone drops the instruction not to fabricate a success, which is the
 * single most important thing this project must never get wrong, and sending a technical
 * message alone is how a stack trace ends up read aloud to a customer.
 *
 * So both travel, in named fields, and the model is told which is which.
 */
export function toFunctionResponse(result: {
  success: boolean;
  data?: unknown;
  error?: ToolError;
  details?: Record<string, any>;
}): Record<string, unknown> {
  if (result.success) {
    return { result: result.data ?? { ok: true } };
  }
  const details = result.details ?? {};
  const recoveryAction = (details.recoveryAction as string) ?? 'ESCALATE';
  const spokenMessage = (details.spokenMessage as string) ?? undefined;

  return {
    error: {
      code: result.error?.code ?? 'UNKNOWN_ERROR',
      // Model-facing: what actually happened, and the standing rule that a failed tool is
      // never something to narrate as done.
      message:
        `${result.error?.message ?? 'The request could not be completed.'} ` +
        `This action did NOT succeed. Do not claim or imply that it was performed. ` +
        `Recovery action: ${recoveryAction}.`,
      retryable: details.retryable ?? false,
      recoveryAction,
      // Caller-facing: safe to speak verbatim. Absent when no mapper line was produced,
      // in which case the model must improvise rather than read a technical string aloud.
      spokenMessage,
    },
  };
}
