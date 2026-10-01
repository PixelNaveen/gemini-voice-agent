/**
 * SECTION 06: Live Relay Protocol Contract
 *
 * The relay used to blindly `JSON.parse` every client frame and forward whatever fields
 * it happened to contain. That accepted unbounded strings, unbounded base64 blobs, an
 * arbitrary client-supplied `systemInstruction`, and any unknown `type`, all of which are
 * trivially abusable.
 *
 * Every inbound frame is now parsed into a validated, length-capped union. Anything that
 * does not conform is rejected with a protocol error and never reaches the provider.
 */

export const PROTOCOL_LIMITS = {
  /** Longest accepted base64 PCM chunk. 16 kHz mono 16-bit = 32 kB/s, so ~1s of audio. */
  MAX_AUDIO_B64_CHARS: 220_000,
  MAX_TEXT_CHARS: 8_000,
  MAX_ID_CHARS: 128,
  MAX_VOICE_CHARS: 64,
  MAX_MEMORY_CHARS: 40_000,
  MAX_INSTRUCTION_OVERRIDE_CHARS: 4_000,
  /** Inbound frame ceiling. Frames above this are refused before JSON parsing. */
  MAX_FRAME_BYTES: 512 * 1024,
} as const;

export interface RejectionResult {
  ok: false;
  reason: string;
  field?: string;
}

export type ValidationResult<T> = { ok: true; value: T } | RejectionResult;

export interface InitSessionCommand {
  type: 'init_session';
  connectionId: string;
  sessionId: string;
  personaId: string;
  voice: string;
  /** Optional, length-capped operator override. The base prompt is server-owned. */
  instructionOverride: string | null;
  /** Untrusted conversation state. Length-capped and fenced as data by the server. */
  sessionMemory: string;
}

export interface ReconnectSessionCommand {
  type: 'reconnect_session';
  connectionId: string;
  sessionId: string;
  personaId: string;
  voice: string;
  instructionOverride: string | null;
  sessionMemory: string;
  resumptionHandle: string | null;
}

export interface ConfigureCommand {
  type: 'configure';
  voice?: string;
  instructionOverride?: string | null;
}

export interface SilenceCheckCommand {
  type: 'silence_check';
  prompt: string;
}

export interface RealtimeInputCommand {
  type: 'realtime_input';
  pcmBase64: string;
}

export interface ClientContentCommand {
  type: 'client_content';
  text: string;
}

/**
 * F-28: the operator erased this call's memory.
 *
 * This is an announcement, not a request that the server assemble anything. The browser owns
 * the caller's memory, so the frame carries no content at all: it exists so the server can
 * stop asserting facts into the live prompt that the operator has just deleted. Carrying a
 * payload here would reintroduce the very data the reset is meant to remove.
 */
export interface SessionMemoryResetCommand {
  type: 'session_memory_reset';
  connectionId?: string;
  sessionId?: string;
}

export type ClientCommand =
  | InitSessionCommand
  | ReconnectSessionCommand
  | ConfigureCommand
  | SilenceCheckCommand
  | RealtimeInputCommand
  | ClientContentCommand
  | SessionMemoryResetCommand;

const KNOWN_TYPES = new Set([
  'init_session',
  'reconnect_session',
  'configure',
  'silence_check',
  'realtime_input',
  'client_content',
  'session_memory_reset',
  'ping',
]);

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const ID_RE = /^[A-Za-z0-9_:.@\-]{1,128}$/;

function reject(reason: string, field?: string): RejectionResult {
  return { ok: false, reason, ...(field ? { field } : {}) };
}

function readString(
  source: Record<string, unknown>,
  field: string,
  max: number,
  { required }: { required: boolean }
): ValidationResult<string> {
  const raw = source[field];
  if (raw === undefined || raw === null) {
    return required ? reject(`"${field}" is required`, field) : { ok: true, value: '' };
  }
  if (typeof raw !== 'string') {
    return reject(`"${field}" must be a string`, field);
  }
  if (raw.length > max) {
    return reject(`"${field}" exceeds the ${max} character limit (received ${raw.length})`, field);
  }
  return { ok: true, value: raw };
}

function readId(source: Record<string, unknown>, field: string): ValidationResult<string> {
  const res = readString(source, field, PROTOCOL_LIMITS.MAX_ID_CHARS, { required: true });
  if (!res.ok) return res;
  if (!ID_RE.test(res.value)) {
    return reject(`"${field}" contains characters that are not allowed in an identifier`, field);
  }
  return res;
}

function readNullableCapped(
  source: Record<string, unknown>,
  field: string,
  max: number
): ValidationResult<string | null> {
  const raw = source[field];
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return reject(`"${field}" must be a string or null`, field);
  if (raw.length > max) return reject(`"${field}" exceeds the ${max} character limit`, field);
  const trimmed = raw.trim();
  return { ok: true, value: trimmed.length === 0 ? null : trimmed };
}

/**
 * Parses and validates a single inbound client frame.
 * Never throws: a malformed frame produces a RejectionResult the caller can answer.
 */
export function parseClientFrame(raw: string | Buffer): ValidationResult<ClientCommand | { type: 'ping' }> {
  if (raw.length > PROTOCOL_LIMITS.MAX_FRAME_BYTES) {
    return reject('frame exceeds the maximum accepted size');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    return reject('frame is not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return reject('frame must be a JSON object');
  }

  const source = parsed as Record<string, unknown>;
  const type = source.type;

  if (typeof type !== 'string') return reject('frame is missing a string "type"', 'type');
  if (!KNOWN_TYPES.has(type)) {
    return reject(`unsupported message type "${type}"`, 'type');
  }

  if (type === 'ping') {
    return { ok: true, value: { type: 'ping' } };
  }

  switch (type) {
    case 'init_session':
    case 'reconnect_session': {
      const connectionId = readId(source, 'connectionId');
      if (!connectionId.ok) return connectionId;
      const sessionId = readId(source, 'sessionId');
      if (!sessionId.ok) return sessionId;
      const personaId = readId(source, 'personaId');
      if (!personaId.ok) return personaId;
      const voice = readString(source, 'voice', PROTOCOL_LIMITS.MAX_VOICE_CHARS, { required: false });
      if (!voice.ok) return voice;
      const override = readNullableCapped(
        source,
        'instructionOverride',
        PROTOCOL_LIMITS.MAX_INSTRUCTION_OVERRIDE_CHARS
      );
      if (!override.ok) return override;
      const memory = readNullableCapped(source, 'sessionMemory', PROTOCOL_LIMITS.MAX_MEMORY_CHARS);
      if (!memory.ok) return memory;

      const base = {
        connectionId: connectionId.value,
        sessionId: sessionId.value,
        personaId: personaId.value,
        voice: voice.value || 'Kore',
        instructionOverride: override.value,
        sessionMemory: memory.value ?? '',
      } as const;

      if (type === 'init_session') {
        return { ok: true, value: { type: 'init_session', ...base } };
      }

      const handle = readNullableCapped(source, 'resumptionHandle', PROTOCOL_LIMITS.MAX_ID_CHARS);
      if (!handle.ok) return handle;
      return { ok: true, value: { type: 'reconnect_session', ...base, resumptionHandle: handle.value } };
    }

    case 'configure': {
      const voice = readString(source, 'voice', PROTOCOL_LIMITS.MAX_VOICE_CHARS, { required: false });
      if (!voice.ok) return voice;
      const override = readNullableCapped(
        source,
        'instructionOverride',
        PROTOCOL_LIMITS.MAX_INSTRUCTION_OVERRIDE_CHARS
      );
      if (!override.ok) return override;
      return {
        ok: true,
        value: {
          type: 'configure',
          ...(voice.value ? { voice: voice.value } : {}),
          ...(source.instructionOverride !== undefined ? { instructionOverride: override.value } : {}),
        },
      };
    }

    case 'silence_check': {
      const prompt = readString(source, 'prompt', PROTOCOL_LIMITS.MAX_TEXT_CHARS, { required: true });
      if (!prompt.ok) return prompt;
      if (prompt.value.trim().length === 0) return reject('"prompt" must not be empty', 'prompt');
      return { ok: true, value: { type: 'silence_check', prompt: prompt.value } };
    }

    case 'realtime_input': {
      const pcm = readString(source, 'pcmBase64', PROTOCOL_LIMITS.MAX_AUDIO_B64_CHARS, { required: true });
      if (!pcm.ok) return pcm;
      if (pcm.value.length === 0) return reject('"pcmBase64" must not be empty', 'pcmBase64');
      // Reject anything that is not plausible base64 so the provider never receives junk.
      const sample = pcm.value.slice(0, 4096);
      if (!BASE64_RE.test(sample)) {
        return reject('"pcmBase64" is not valid base64', 'pcmBase64');
      }
      return { ok: true, value: { type: 'realtime_input', pcmBase64: pcm.value } };
    }

    case 'client_content': {
      const text = readString(source, 'text', PROTOCOL_LIMITS.MAX_TEXT_CHARS, { required: true });
      if (!text.ok) return text;
      if (text.value.trim().length === 0) return reject('"text" must not be empty', 'text');
      return { ok: true, value: { type: 'client_content', text: text.value } };
    }

    default:
      return reject(`unsupported message type "${type}"`, 'type');
  }
}
