import { AuraError } from './AuraError';
import { ErrorCode } from './ErrorCode';

export class UserErrorMapper {
  /**
   * Converts a technical machine error into natural, empathetic receptionist dialogue.
   *
   * Two rules govern every line here:
   *
   * 1. Never state something about the business that the system did not verify. A
   *    provider outage must not be spoken as "that slot isn't open", and a lost response
   *    must not be spoken as a confirmed booking.
   * 2. Never leak system terminology. The caller hears a receptionist, not a stack trace.
   */
  public static toSpokenMessage(error: AuraError): string {
    switch (error.code) {
      case ErrorCode.AUDIO_PERMISSION_DENIED:
        return "I can't hear you just yet. Please allow microphone access in your browser so we can talk.";

      case ErrorCode.AUDIO_DEVICE_NOT_FOUND:
        return "I can't find a microphone on this device. Could you check that it's connected and selected?";

      case ErrorCode.AUDIO_CONTEXT_BLOCKED:
        return 'Please tap anywhere on the screen so I can activate voice audio.';

      case ErrorCode.TRANSPORT_CONNECTION_FAILED:
      case ErrorCode.TRANSPORT_CONNECTION_CLOSED:
      case ErrorCode.TRANSPORT_TIMEOUT:
        return "I'm having a brief connection interruption. Reconnecting now...";

      case ErrorCode.BOOKING_NO_AVAILABILITY:
        return "That specific time slot isn't open on the calendar. Let me offer you our next available opening.";

      case ErrorCode.BOOKING_CONFLICT:
        return 'That slot was just reserved. Let me check another time that works for you.';

      case ErrorCode.BOOKING_FAILED:
        return "I wasn't able to complete that booking just now, and I don't want to guess. Let me have the front desk confirm it for you.";

      case ErrorCode.BOOKING_UNKNOWN_RESULT:
        return "The booking system didn't confirm the reservation immediately. Let me double check that for you.";

      case ErrorCode.TOOL_TIMEOUT:
      case ErrorCode.TOOL_UNAVAILABLE:
        return "I'm having a slight delay accessing our business calendar. One moment while I check.";

      case ErrorCode.TOOL_INVALID_RESPONSE:
        return "I got something back from the booking system that I can't read, so I'm not going to confirm anything yet. Let me check that for you.";

      case ErrorCode.TOOL_VALIDATION_ERROR:
        return 'I still need one more detail before I can finish that. Could you repeat it for me?';

      case ErrorCode.TOOL_NO_AUTHORITATIVE_ANSWER:
        return "I don't have a verified answer for that, and I won't guess. Let me get someone to confirm it for you.";

      case ErrorCode.MODEL_RATE_LIMITED:
        return "I'm running a moment behind. Give me just a second to catch up.";

      case ErrorCode.POLICY_VIOLATION:
        // The underlying message is tool-authored and frequently technical
        // ("Appointment booking requires explicit final confirmation before transaction
        // execution."). It is deliberately not echoed: this class owns the wording a
        // caller hears.
        return "I'm sorry, that isn't something I can do under our booking policy. I can offer you the next available option, or pass you to the front desk.";

      case ErrorCode.STALE_CONNECTION:
        return 'Sorry, I lost the thread of that for a second. Could you say that again?';

      case ErrorCode.SESSION_EXPIRED:
        return 'Our demo session call limit has ended. Thank you for speaking with AURA!';

      case ErrorCode.SESSION_ENDED:
        return 'Thanks for calling. Have a great day.';

      case ErrorCode.PERSONA_NOT_FOUND:
        return "I don't have the business details loaded for this call, so I don't want to guess. Let me transfer you to the front desk.";

      default:
        if (error.category === 'USER_ACTION') {
          return 'Please check your audio settings so we can continue.';
        }
        if (error.category === 'BUSINESS_FAILURE') {
          return "I wasn't able to complete that request with the current details. Could you give me one more detail?";
        }
        return "I'm experiencing a brief system delay. Let's continue.";
    }
  }
}
