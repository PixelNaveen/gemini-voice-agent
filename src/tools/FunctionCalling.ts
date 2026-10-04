import { ToolGateway } from './ToolGateway';
import type { ToolError } from './ToolTypes';

/**
 * JSON Schema for each tool's arguments, mirroring the real tool input types for Schema v2.0.0.
 */
const TOOL_SCHEMAS: Record<string, { parameters: Record<string, unknown>; description: string }> = {
  checkAvailability: {
    description: 'Look up open appointment or reservation slots for a service on a given date and time.',
    parameters: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'The service ID or name, e.g. "haircut".' },
        service: { type: 'string', description: 'The service name.' },
        date: { type: 'string', description: 'Date phrase or YYYY-MM-DD date, e.g. "tomorrow" or "2026-10-12".' },
        isoDate: { type: 'string', description: 'Calendar date in YYYY-MM-DD form.' },
        time: { type: 'string', description: 'Optional preferred time, e.g. "14:00" or "3 PM".' },
        partySize: { type: 'number', description: 'Optional party size for restaurants/events.' },
        resourceId: { type: 'string', description: 'Optional specific staff, table, or bay ID.' },
      },
      required: [],
    },
  },
  findAlternativeTimes: {
    description: 'Find alternative open appointment times across nearby dates when a requested slot is unavailable.',
    parameters: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'The service ID or name.' },
        date: { type: 'string', description: 'The starting date to search from in YYYY-MM-DD form.' },
        partySize: { type: 'number', description: 'Optional party size.' },
        resourceId: { type: 'string', description: 'Optional resource ID.' },
      },
      required: ['date'],
    },
  },
  createAppointment: {
    description: 'Book and confirm an appointment. ONLY call this after the caller explicitly confirms.',
    parameters: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'The service ID.' },
        service: { type: 'string', description: 'The service name.' },
        date: { type: 'string', description: 'Calendar date in YYYY-MM-DD form.' },
        isoDate: { type: 'string', description: 'Calendar date in YYYY-MM-DD form.' },
        start: { type: 'string', description: 'Start time in HH:MM form.' },
        time: { type: 'string', description: 'Start time in HH:MM form.' },
        customerName: { type: 'string', description: "The caller's full name." },
        email: { type: 'string', description: "The caller's email address." },
        phone: { type: 'string', description: "The caller's phone number." },
        partySize: { type: 'number', description: 'Optional party size.' },
        vehicleInfo: { type: 'string', description: 'Vehicle make/model/year for auto repair.' },
        notes: { type: 'string', description: 'Optional notes.' },
      },
      required: ['customerName'],
    },
  },
  lookupAppointment: {
    description: 'Look up an existing appointment by confirmation code or session.',
    parameters: {
      type: 'object',
      properties: {
        confirmationCode: { type: 'string', description: 'The confirmation code, e.g. "AUR-1042".' },
      },
    },
  },
  rescheduleAppointment: {
    description: 'Move an existing appointment to a new date and time.',
    parameters: {
      type: 'object',
      properties: {
        confirmationCode: { type: 'string', description: 'The confirmation code of the appointment.' },
        newDate: { type: 'string', description: 'New date in YYYY-MM-DD form.' },
        newStart: { type: 'string', description: 'New start time in HH:MM form.' },
        resourceId: { type: 'string', description: 'Optional resource ID.' },
      },
      required: [],
    },
  },
  cancelAppointment: {
    description: 'Cancel an existing appointment. ONLY call this after caller confirmation.',
    parameters: {
      type: 'object',
      properties: {
        confirmationCode: { type: 'string', description: 'The confirmation code of the appointment.' },
        confirmed: { type: 'boolean', description: 'Must be true to confirm cancellation.' },
      },
      required: [],
    },
  },
  getBusinessHours: {
    description: "Get the business's opening hours and holiday closures.",
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Optional date or weekday to check.' },
        day: { type: 'string', description: 'Optional day name.' },
      },
    },
  },
  getServiceInfo: {
    description: 'Look up pricing, duration, prep notes, and details for a service.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The service name or keyword to query, e.g. "haircut" or "oil change".' },
      },
      required: ['query'],
    },
  },
  getServicePrice: {
    description: 'Get the price of a service.',
    parameters: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'The service name.' },
      },
      required: ['service'],
    },
  },
};

/**
 * Builds the `tools` array for a persona's live session.
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
 * Builds the function response the model reads back.
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
      message:
        `${result.error?.message ?? 'The request could not be completed.'} ` +
        `This action did NOT succeed. Do not claim or imply that it was performed. ` +
        `Recovery action: ${recoveryAction}.`,
      retryable: details.retryable ?? false,
      recoveryAction,
      spokenMessage,
    },
  };
}
