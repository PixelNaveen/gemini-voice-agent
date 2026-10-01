import { ToolExecutionContext, ToolResult } from './ToolTypes';
import { checkAvailabilityTool } from './calendar/checkAvailability';
import { createAppointmentTool } from './calendar/createAppointment';
import { cancelAppointmentTool } from './calendar/cancelAppointment';
import { rescheduleAppointmentTool } from './calendar/rescheduleAppointment';
import { getBusinessHoursTool } from './business/getBusinessHours';
import { getServicePriceTool } from './business/getServicePrice';
import { sendConfirmationTool } from './messaging/sendConfirmation';
import { transferCallTool } from './transfer/transferCall';
import { PersonaRegistry } from '../personas/PersonaRegistry';
import { ErrorManager } from '../core/errors';

export type ToolHandler = (context: ToolExecutionContext, input: any) => Promise<ToolResult>;

export class ToolGateway {
  private static handlers: Record<string, { handler: ToolHandler; isSideEffect: boolean }> = {
    checkAvailability: { handler: checkAvailabilityTool, isSideEffect: false },
    createAppointment: { handler: createAppointmentTool, isSideEffect: true },
    cancelAppointment: { handler: cancelAppointmentTool, isSideEffect: true },
    rescheduleAppointment: { handler: rescheduleAppointmentTool, isSideEffect: true },
    getBusinessHours: { handler: getBusinessHoursTool, isSideEffect: false },
    getServicePrice: { handler: getServicePriceTool, isSideEffect: false },
    sendConfirmation: { handler: sendConfirmationTool, isSideEffect: true },
    transferCall: { handler: transferCallTool, isSideEffect: true },
  };

  private static executionAuditLog: ToolResult[] = [];

  /**
   * Authoritative execution gateway with strict Persona capability authorization.
   */
  public static async execute(
    toolName: string,
    input: any,
    sessionMeta: { sessionId: string; personaId: string; connectionId?: string; isConfirmedByUser?: boolean }
  ): Promise<ToolResult> {
    const operationId = `op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const context: ToolExecutionContext = {
      sessionId: sessionMeta.sessionId,
      personaId: sessionMeta.personaId,
      connectionId: sessionMeta.connectionId,
      operationId,
      timestamp: Date.now(),
      toolName,
      isConfirmedByUser: sessionMeta.isConfirmedByUser ?? false,
    };

    // 1. Tool Existence Check
    const toolDef = this.handlers[toolName];
    if (!toolDef) {
      const errResult: ToolResult = {
        success: false,
        toolName,
        operationId,
        status: 'FAILED',
        error: { code: 'NOT_FOUND', message: `Tool "${toolName}" is not registered in ToolGateway.` },
        executedAt: Date.now(),
      };
      this.executionAuditLog.push(errResult);
      return errResult;
    }

    // 2. Persona Capability Authorization Check
    const persona = PersonaRegistry.get(context.personaId);
    if (!persona.tools.allowed.includes(toolName)) {
      const authErrResult: ToolResult = {
        success: false,
        toolName,
        operationId,
        status: 'FAILED',
        error: {
          code: 'AUTHORIZATION_ERROR',
          message: `Tool "${toolName}" is not authorized for persona "${context.personaId}".`,
        },
        executedAt: Date.now(),
      };
      this.executionAuditLog.push(authErrResult);
      return authErrResult;
    }

    console.log(`[ToolGateway] Executing authorized "${toolName}" (SideEffect: ${toolDef.isSideEffect}) for Session: ${context.sessionId}`);

    try {
      const result = await toolDef.handler(context, input);
      this.executionAuditLog.push(result);

      // SECTION 13: a tool can also fail *without* throwing, by returning a failure result.
      // That is the normal shape for these handlers, so the catch block below alone would
      // have left the entire live failure path unclassified.
      if (!result.success && result.error) {
        const handled = ErrorManager.handleToolFailure(result.error, {
          sessionId: context.sessionId,
          personaId: context.personaId,
          connectionId: context.connectionId,
          operationId,
        });
        console.warn(
          `[ToolGateway] "${toolName}" failed: ${handled.error.code} ` +
            `(${handled.error.category}/${handled.error.source}). ` +
            `Action: ${handled.action.action}.`
        );
        // `details` is where the caller-safe line and the recovery action travel, so the
        // model says something truthful instead of reading a technical message aloud.
        result.details = {
          ...(result.details ?? {}),
          auraCode: handled.error.code,
          category: handled.error.category,
          source: handled.error.source,
          retryable: handled.error.retryable,
          recoveryAction: handled.action.action,
          spokenMessage: handled.spokenMessage,
        };
      }
      return result;
    } catch (err: any) {
      console.error(`[ToolGateway] Execution error for "${toolName}":`, err);
      // F-22: a thrown error reaches the same taxonomy as a returned failure, rather than
      // becoming a bare `UNKNOWN_ERROR` string that nothing downstream can classify.
      const handled = ErrorManager.handle(err, {
        sessionId: context.sessionId,
        personaId: context.personaId,
        connectionId: context.connectionId,
        operationId,
      });
      const errResult: ToolResult = {
        success: false,
        toolName,
        operationId,
        status: 'FAILED',
        error: { code: 'UNKNOWN_ERROR', message: err.message || 'Internal tool execution error' },
        details: {
          auraCode: handled.error.code,
          category: handled.error.category,
          source: handled.error.source,
          retryable: handled.error.retryable,
          recoveryAction: handled.action.action,
          spokenMessage: handled.spokenMessage,
        },
        executedAt: Date.now(),
      };
      this.executionAuditLog.push(errResult);
      return errResult;
    }
  }

  public static getAuditLog(): ToolResult[] {
    return [...this.executionAuditLog];
  }

  /**
   * SECTION 09: Single source of truth for which tools actually exist.
   *
   * The persona audit must not decide this from a hand-maintained list, because that list
   * drifts: every persona claimed four capabilities while a separate hardcoded set said
   * none of them were implemented. Querying the real handler registry means a persona can
   * never allow a tool the server cannot honestly perform.
   */
  public static isImplemented(toolName: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.handlers, toolName);
  }

  public static listImplemented(): string[] {
    return Object.keys(this.handlers);
  }

  /** Tools that have a real-world side effect and therefore need a configured provider. */
  public static requiresProvider(toolName: string): boolean {
    return this.handlers[toolName]?.isSideEffect === true;
  }

  /**
   * SECTION 09: Whether a side-effecting tool can genuinely run right now.
   *
   * An honest tool that reports UNAVAILABLE when its provider is missing is still
   * implemented; this reports whether it can succeed on this deployment.
   */
  public static hasLiveProvider(toolName: string): boolean {
    switch (toolName) {
      case 'sendConfirmation':
        return Boolean(process.env.AURA_CONFIRMATION_WEBHOOK_URL?.trim());
      case 'transferCall':
        return Boolean(process.env.AURA_TRANSFER_WEBHOOK_URL?.trim());
      default:
        return true;
    }
  }
}
