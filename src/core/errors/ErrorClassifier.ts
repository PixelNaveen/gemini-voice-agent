import { AuraError } from './AuraError';
import { ErrorCode } from './ErrorCode';
import { ErrorCategory, ErrorSource } from './ErrorCategory';
import type { ToolError, ToolErrorCode } from '../../tools/ToolTypes';

/**
 * A single, ordered vocabulary for "what kind of failure was this".
 *
 * The classifier exists so that no code path has to guess, and - more importantly - so
 * that a technical failure is never reported to a caller as a statement about the
 * business. Classifying a provider outage as `BOOKING_NO_AVAILABILITY` produces the
 * spoken line "That specific time slot isn't open on the calendar", which is a fabricated
 * claim about a real calendar. That is the specific class of bug this taxonomy has to
 * make impossible, so the ordering below puts infrastructure failures ahead of business
 * ones and never lets a generic word ("unavailable", "close", "mic") decide a category.
 */
export class ErrorClassifier {
  /** Audio permission: must be about audio, not about any "permission" string. */
  private static readonly AUDIO_PERMISSION_RE =
    /(microphone|mic\b|audio\s*(input|context|capture)|getusermedia)/i;

  /** Transport loss: must name a connection, socket or stream. */
  private static readonly TRANSPORT_RE =
    /(websocket|web socket|socket|\b1006\b|\b1001\b|\b1011\b|abnormal close|connection (closed|reset|lost|refused|failed)|transport|stream (closed|ended|error))/i;

  /** A calendar or booking system that exists but has no room. */
  private static readonly NO_AVAILABILITY_RE =
    /(no (availability|available slots?|openings?|slots?)|nothing available|fully booked|no matching (slot|appointment|opening)|slot is (taken|unavailable)|not available on)/i;

  /** A double booking on the same slot. */
  private static readonly CONFLICT_RE = /(conflict|double.?book|already booked|slot is taken)/i;

  /** A refusal by a business policy (notice window, reschedule rules, scope). */
  private static readonly POLICY_RE = /(policy|notice period|minimum notice|outside (our|the) (policy|notice)|reschedul\w* (not|is not) allowed)/i;

  /** Saturation: a throttling or overload answer, from either dependency. */
  private static readonly THROTTLE_RE =
    /(quota|rate.?limit|too many requests|\b429\b|resource.?exhausted|\b503\b|overload|capacity|try again later)/i;

  /** A request that never got an answer. Kept apart from "the dependency is down" so the
   *  caller is told a delay rather than a failure. */
  private static readonly TIMEOUT_RE = /(timeout|timed out|\betimedout\b|deadline exceeded|aborted due to time)/i;

  /** Infrastructure-shaped failures that are neither throttling nor a timeout. */
  private static readonly INFRA_RE =
    /(unavailable|unreachable|not configured|not implemented|missing (api )?key|unauthori[sz]ed|forbidden|\b5\d\d\b|econnrefused|econnreset|enotfound)/i;

  /** Whose failure is it? A "503" names a condition, never the component that has it. */
  private static readonly MODEL_SUBJECT_RE =
    /(gemini|live api|\bmodel\b|model provider|context (length|window)|api key)/i;
  private static readonly TOOL_SUBJECT_RE =
    /(calendar|booking|appointment|scheduler|slot|tool|gateway|webhook|provider is|crm|calendar api)/i;

  /** An authorization failure that names the model, i.e. our own credentials. */
  private static readonly AUTH_RE = /(api key|unauthori[sz]ed|forbidden|401|403|permission denied by)/i;

  /**
   * Normalizes any caught error into a typed AuraError.
   */
  public static classify(
    err: unknown,
    fallbackContext?: {
      sessionId?: string;
      personaId?: string;
      connectionId?: string;
      operationId?: string;
    }
  ): AuraError {
    if (err instanceof AuraError) {
      return err;
    }

    const message = (err as any)?.message || String(err);
    const lower = message.toLowerCase();

    let code: ErrorCode | string = ErrorCode.MODEL_SESSION_FAILED;
    let category: ErrorCategory = 'RECOVERABLE';
    let source: ErrorSource = 'SYSTEM';
    let retryable = true;

    if (
      // `NotAllowedError` is the DOMException a browser raises when microphone access is
      // refused, and its message is often just "Permission denied" with no audio wording.
      /notallowederror/i.test(lower) ||
      (ErrorClassifier.AUDIO_PERMISSION_RE.test(lower) &&
        /denied|blocked|refused|not allowed|permission/i.test(lower))
    ) {
      code = ErrorCode.AUDIO_PERMISSION_DENIED;
      category = 'USER_ACTION';
      source = 'AUDIO';
      retryable = false;
    } else if (ErrorClassifier.TRANSPORT_RE.test(lower)) {
      code = ErrorCode.TRANSPORT_CONNECTION_CLOSED;
      category = 'RECOVERABLE';
      source = 'TRANSPORT';
      retryable = true;
    } else if (ErrorClassifier.CONFLICT_RE.test(lower)) {
      code = ErrorCode.BOOKING_CONFLICT;
      category = 'BUSINESS_FAILURE';
      source = 'BUSINESS';
      retryable = false;
    } else if (ErrorClassifier.NO_AVAILABILITY_RE.test(lower)) {
      code = ErrorCode.BOOKING_NO_AVAILABILITY;
      category = 'BUSINESS_FAILURE';
      source = 'BUSINESS';
      retryable = false;
    } else if (ErrorClassifier.POLICY_RE.test(lower)) {
      code = ErrorCode.POLICY_VIOLATION;
      category = 'BUSINESS_FAILURE';
      source = 'BUSINESS';
      retryable = false;
    } else if (ErrorClassifier.TIMEOUT_RE.test(lower)) {
      // The transport branch above has already claimed connection-level timeouts, so this
      // is a request against a dependency that did not answer. A delay, not an absence.
      code = ErrorCode.TOOL_TIMEOUT;
      category = 'RECOVERABLE';
      source = 'TOOL';
      retryable = true;
    } else if (
      ErrorClassifier.AUTH_RE.test(lower) &&
      ErrorClassifier.MODEL_SUBJECT_RE.test(lower) &&
      !ErrorClassifier.TOOL_SUBJECT_RE.test(lower)
    ) {
      // Our own credentials. Retrying cannot fix it, and saying "one moment" would be a lie.
      code = ErrorCode.MODEL_AUTH_FAILED;
      category = 'RECOVERABLE';
      source = 'MODEL';
      retryable = false;
    } else if (ErrorClassifier.THROTTLE_RE.test(lower) || ErrorClassifier.INFRA_RE.test(lower)) {
      // An infrastructure or integration failure. Deliberately NOT a business failure:
      // "the calendar provider is unavailable" says nothing about whether a slot is open,
      // and the spoken line for it must not imply that it does.
      //
      // A 429 or 503 names a condition, not a component, so the source is taken from
      // whichever component the message names. The previous version keyed off the bare
      // words, which meant "Calendar provider is temporarily unavailable (503)" was
      // recorded as a model rate limit - the audit trail blamed Gemini for a booking
      // backend outage, and retrying the model could never have fixed it.
      const isModelSubject =
        ErrorClassifier.MODEL_SUBJECT_RE.test(lower) && !ErrorClassifier.TOOL_SUBJECT_RE.test(lower);
      code = isModelSubject ? ErrorCode.MODEL_RATE_LIMITED : ErrorCode.TOOL_UNAVAILABLE;
      category = 'RECOVERABLE';
      source = isModelSubject ? 'MODEL' : 'TOOL';
      retryable = true;
    }

    return new AuraError({
      code,
      category,
      source,
      message,
      retryable,
      sessionId: fallbackContext?.sessionId,
      personaId: fallbackContext?.personaId,
      connectionId: fallbackContext?.connectionId,
      operationId: fallbackContext?.operationId,
      cause: err,
    });
  }

  /**
   * Maps the tool layer's own failure vocabulary (`ToolResult.error`) onto the taxonomy.
   *
   * `ToolGateway.execute` is the only producer of `ToolError` in the running system, and it
   * is the place where a machine failure becomes something the agent may say out loud.
   * Classifying there - rather than re-deriving a category from the message text - is what
   * keeps the spoken line, the retry decision and the audit record in agreement.
   */
  public static fromToolError(
    toolError: ToolError,
    context?: {
      sessionId?: string;
      personaId?: string;
      connectionId?: string;
      operationId?: string;
      toolName?: string;
    }
  ): AuraError {
    const { code, message } = toolError;
    const base = {
      message,
      sessionId: context?.sessionId,
      personaId: context?.personaId,
      connectionId: context?.connectionId,
      operationId: context?.operationId,
    };

    switch (code as ToolErrorCode) {
      case 'VALIDATION_ERROR':
        return new AuraError({
          ...base,
          code: ErrorCode.TOOL_VALIDATION_ERROR,
          category: 'BUSINESS_FAILURE',
          source: 'TOOL',
          // A missing or malformed caller detail is fixable in the conversation, so the
          // agent should ask for it rather than treat the call as broken.
          retryable: false,
        });

      case 'AUTHORIZATION_ERROR':
        return new AuraError({
          ...base,
          code: ErrorCode.POLICY_VIOLATION,
          category: 'BUSINESS_FAILURE',
          source: 'TOOL',
          retryable: false,
        });

      case 'CONFLICT':
        return new AuraError({
          ...base,
          code: ErrorCode.BOOKING_CONFLICT,
          category: 'BUSINESS_FAILURE',
          source: 'BUSINESS',
          retryable: false,
        });

      case 'NOT_FOUND':
        // `NOT_FOUND` is the tool layer saying "I could not find that", and its two
        // producers mean different things: an unpublished service price
        // (`getServicePrice`) and an unregistered tool name (`ToolGateway`). Neither is
        // evidence about the calendar. Only a message that actually names a slot, a
        // calendar or an appointment is allowed to become a business fact - speaking
        // "that time slot isn't open" after a missing price would be a fabrication, and
        // it is the exact confusion this mapping is here to prevent.
        if (/(slot|calendar|appointment|availability|opening|booking|schedule)/i.test(message)) {
          return new AuraError({
            ...base,
            code: ErrorCode.BOOKING_NO_AVAILABILITY,
            category: 'BUSINESS_FAILURE',
            source: 'BUSINESS',
            retryable: false,
          });
        }
        return new AuraError({
          ...base,
          code: ErrorCode.TOOL_NO_AUTHORITATIVE_ANSWER,
          // A knowledge gap, not a refusal and not an outage: the tool worked.
          category: 'RECOVERABLE',
          source: 'TOOL',
          // Retrying the same lookup changes nothing, so this must reach a human
          // (a callback or a transfer) instead of a retry loop.
          retryable: false,
        });

      case 'INTERNAL_ERROR':
        // A fault in our own code, not a bad answer from a provider. It used to fall to the
        // `default` branch and be classified `TOOL_INVALID_RESPONSE`, whose spoken line
        // blames the booking system for sending back something unreadable - so an internal
        // bug would have had the agent telling the caller that the calendar misbehaved.
        return new AuraError({
          ...base,
          code: ErrorCode.TOOL_UNAVAILABLE,
          category: 'RECOVERABLE',
          source: 'TOOL',
          retryable: true,
        });

      case 'TIMEOUT':
        return new AuraError({
          ...base,
          code: ErrorCode.TOOL_TIMEOUT,
          category: 'RECOVERABLE',
          source: 'TOOL',
          retryable: true,
        });

      case 'UNAVAILABLE':
        return new AuraError({
          ...base,
          code: ErrorCode.TOOL_UNAVAILABLE,
          category: 'RECOVERABLE',
          source: 'TOOL',
          retryable: true,
        });

      case 'RATE_LIMITED':
        return new AuraError({
          ...base,
          code: ErrorCode.MODEL_RATE_LIMITED,
          category: 'RECOVERABLE',
          source: 'MODEL',
          retryable: true,
        });

      case 'INTEGRATION_ERROR':
      case 'UNKNOWN_ERROR':
      default:
        return new AuraError({
          ...base,
          code: ErrorCode.TOOL_INVALID_RESPONSE,
          category: 'RECOVERABLE',
          source: 'TOOL',
          retryable: true,
        });
    }
  }
}
