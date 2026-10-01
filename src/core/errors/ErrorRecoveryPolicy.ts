import { AuraError } from './AuraError';
import { ErrorCode } from './ErrorCode';

export type EscalationLevel =
  | 'SILENT_RETRY' // Level 0
  | 'USER_NOTICE' // Level 1
  | 'ALTERNATIVE_PATH' // Level 2
  | 'HUMAN_HANDOFF' // Level 3
  | 'TERMINATION'; // Level 4

export interface RecoveryAction {
  action: 'RETRY' | 'WAIT_USER_ACTION' | 'CONTINUE_CONVERSATION' | 'ESCALATE_HUMAN' | 'TERMINATE';
  escalationLevel: EscalationLevel;
  delayMs?: number;
  spokenNotice?: string;
}

export class ErrorRecoveryPolicy {
  public static readonly MAX_RETRY_ATTEMPTS = 4;
  public static readonly BASE_BACKOFF_MS = 1000;
  public static readonly MAX_BACKOFF_MS = 10000;

  public static determineAction(error: AuraError, attemptCount = 0): RecoveryAction {
    // 1. User Action Required
    if (error.category === 'USER_ACTION') {
      return {
        action: 'WAIT_USER_ACTION',
        escalationLevel: 'USER_NOTICE',
      };
    }

    // 2. Business Failure
    if (error.category === 'BUSINESS_FAILURE') {
      return {
        action: 'CONTINUE_CONVERSATION',
        escalationLevel: 'ALTERNATIVE_PATH',
      };
    }

    // 3. Fatal Technical Errors
    if (error.category === 'FATAL') {
      return {
        action: 'TERMINATE',
        escalationLevel: 'TERMINATION',
      };
    }

    // 4. Recoverable Errors with Exponential Backoff + Jitter
    if (error.retryable && attemptCount < this.MAX_RETRY_ATTEMPTS) {
      const exponentialDelay = Math.min(
        this.BASE_BACKOFF_MS * Math.pow(2, attemptCount),
        this.MAX_BACKOFF_MS
      );
      const jitter = Math.floor(Math.random() * 500); // 0-500ms random jitter
      const delayMs = exponentialDelay + jitter;

      const escalationLevel: EscalationLevel = attemptCount === 0 ? 'SILENT_RETRY' : 'USER_NOTICE';

      return {
        action: 'RETRY',
        escalationLevel,
        delayMs,
        spokenNotice:
          attemptCount === 0
            ? undefined
            : attemptCount === 1
            ? "I'm reconnecting..."
            : "Still restoring connection...",
      };
    }

    // 5. Retries Exhausted -> Escalate to Human Handoff / Safe Termination
    return {
      action: 'ESCALATE_HUMAN',
      escalationLevel: 'HUMAN_HANDOFF',
      // The handoff line has to describe the failure that actually happened. It used to be
      // the same sentence for every escalation, so a missing price was handed off with
      // "I'm unable to restore our live connection" - inventing a connection outage that
      // never happened in order to explain a handoff.
      spokenNotice:
        error.source === 'BUSINESS' || error.code === ErrorCode.TOOL_NO_AUTHORITATIVE_ANSWER
          ? "I don't want to guess at that one. Let me transfer you to the front desk, who can confirm it."
          : "I'm having trouble reaching the service I need right now. Let me transfer you to front-desk assistance.",
    };
  }
}
