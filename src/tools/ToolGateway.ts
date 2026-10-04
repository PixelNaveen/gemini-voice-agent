import { ToolExecutionContext, ToolResult } from './ToolTypes';
import { checkAvailabilityTool } from './calendar/checkAvailability';
import { findAlternativeTimesTool } from './calendar/findAlternativeTimes';
import { createAppointmentTool } from './calendar/createAppointment';
import { lookupAppointmentTool } from './calendar/lookupAppointment';
import { cancelAppointmentTool } from './calendar/cancelAppointment';
import { rescheduleAppointmentTool } from './calendar/rescheduleAppointment';
import { getBusinessHoursTool } from './business/getBusinessHours';
import { getServiceInfoTool } from './business/getServiceInfo';
import { getServicePriceTool } from './business/getServicePrice';
import { sendConfirmationTool } from './messaging/sendConfirmation';
import { transferCallTool } from './transfer/transferCall';
import { PersonaRegistry } from '../personas/PersonaRegistry';
import { ErrorManager } from '../core/errors';

export type ToolHandler = (context: ToolExecutionContext, input: any) => Promise<ToolResult>;

export class ToolGateway {
  private static handlers: Record<string, { handler: ToolHandler; isSideEffect: boolean }> = {
    checkAvailability: { handler: checkAvailabilityTool, isSideEffect: false },
    findAlternativeTimes: { handler: findAlternativeTimesTool, isSideEffect: false },
    createAppointment: { handler: createAppointmentTool, isSideEffect: true },
    lookupAppointment: { handler: lookupAppointmentTool, isSideEffect: false },
    cancelAppointment: { handler: cancelAppointmentTool, isSideEffect: true },
    rescheduleAppointment: { handler: rescheduleAppointmentTool, isSideEffect: true },
    getBusinessHours: { handler: getBusinessHoursTool, isSideEffect: false },
    getServiceInfo: { handler: getServiceInfoTool, isSideEffect: false },
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
    const isLegacyTool =
      toolName === 'getServicePrice' ||
      toolName === 'sendConfirmation' ||
      toolName === 'transferCall';

    if (!persona.tools.allowed.includes(toolName) && !isLegacyTool) {
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
      }

      return result;
    } catch (err: any) {
      console.error(`[ToolGateway] Unexpected crash in tool "${toolName}":`, err);

      const handled = ErrorManager.handleToolFailure(
        {
          code: 'INTERNAL_ERROR',
          message: err?.message || 'Tool execution threw an uncaught error',
        },
        {
          sessionId: context.sessionId,
          personaId: context.personaId,
          connectionId: context.connectionId,
          operationId,
        }
      );

      const crashResult: ToolResult = {
        success: false,
        toolName,
        operationId,
        status: 'FAILED',
        error: {
          code: (handled.error.code as any) || 'INTERNAL_ERROR',
          message: handled.spokenMessage,
        },
        executedAt: Date.now(),
      };
      this.executionAuditLog.push(crashResult);
      return crashResult;
    }
  }

  public static isImplemented(toolName: string): boolean {
    return Boolean(this.handlers[toolName]);
  }

  public static hasLiveProvider(toolName: string): boolean {
    return this.isImplemented(toolName);
  }

  public static listImplemented(): string[] {
    return Object.keys(this.handlers);
  }

  public static getAuditLog(): ToolResult[] {
    return [...this.executionAuditLog];
  }

  public static clearAuditLog(): void {
    this.executionAuditLog = [];
  }
}
