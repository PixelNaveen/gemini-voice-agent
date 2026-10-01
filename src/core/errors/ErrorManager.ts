import { AuraError } from './AuraError';
import { ErrorClassifier } from './ErrorClassifier';
import { ErrorRecoveryPolicy, RecoveryAction } from './ErrorRecoveryPolicy';
import { ErrorDiagnostics, ErrorAuditLog } from './ErrorDiagnostics';
import { UserErrorMapper } from './UserErrorMapper';
import type { ToolError } from '../../tools/ToolTypes';

export interface ErrorContext {
  sessionId?: string;
  personaId?: string;
  connectionId?: string;
  operationId?: string;
  attemptCount?: number;
}

export interface HandledError {
  error: AuraError;
  action: RecoveryAction;
  spokenMessage: string;
  log: ErrorAuditLog;
}

export class ErrorManager {
  private static listeners: ((error: AuraError, action: RecoveryAction) => void)[] = [];

  /**
   * The one entry point for "a failure happened". Classifies it, decides what the system
   * does about it, decides what the caller may be told about it, and records all three.
   *
   * Every caller should use this rather than reaching for the classifier or the mapper
   * directly: a classification that is not paired with a recovery action and a record is
   * how an error ends up handled twice, or not at all.
   */
  public static handle(err: unknown, context?: ErrorContext): HandledError {
    const auraError = ErrorClassifier.classify(err, context);
    return this.dispatch(auraError, context?.attemptCount);
  }

  /**
   * The tool-layer entry point.
   *
   * A `ToolResult.error` is the only machine failure the agent is ever shown, so this is
   * where a tool failure stops being a string and becomes a classified event with a
   * decided recovery action and a caller-safe line. It exists so that the tool gateway
   * needs exactly one call rather than four cooperating statics.
   */
  public static handleToolFailure(toolError: ToolError, context?: ErrorContext): HandledError {
    const auraError = ErrorClassifier.fromToolError(toolError, {
      sessionId: context?.sessionId,
      personaId: context?.personaId,
      connectionId: context?.connectionId,
      operationId: context?.operationId,
    });
    return this.dispatch(auraError, context?.attemptCount);
  }

  private static dispatch(auraError: AuraError, attemptCount = 0): HandledError {
    const action = ErrorRecoveryPolicy.determineAction(auraError, attemptCount);
    const spokenMessage = UserErrorMapper.toSpokenMessage(auraError);
    const log = ErrorDiagnostics.record(auraError, attemptCount, action.action);

    for (const listener of this.listeners) {
      try {
        listener(auraError, action);
      } catch (e) {
        console.error('[ErrorManager] Listener error:', e);
      }
    }

    return {
      error: auraError,
      action,
      spokenMessage,
      log,
    };
  }

  public static subscribe(listener: (error: AuraError, action: RecoveryAction) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
