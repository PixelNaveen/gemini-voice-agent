import { AuraError } from './AuraError';

export interface ErrorAuditLog {
  id: string;
  timestamp: number;
  code: string;
  category: string;
  source: string;
  message: string;
  sessionId?: string;
  personaId?: string;
  connectionId?: string;
  operationId?: string;
  attemptCount: number;
  recoveryAction: string;
}

export class ErrorDiagnostics {
  private static auditLogs: ErrorAuditLog[] = [];

  public static record(error: AuraError, attemptCount = 0, recoveryAction = 'NONE'): ErrorAuditLog {
    const entry: ErrorAuditLog = {
      id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      code: error.code,
      category: error.category,
      source: error.source,
      message: error.message,
      sessionId: error.sessionId,
      personaId: error.personaId,
      connectionId: error.connectionId,
      operationId: error.operationId,
      attemptCount,
      recoveryAction,
    };
    this.auditLogs.push(entry);
    if (this.auditLogs.length > 100) {
      this.auditLogs.shift();
    }
    return entry;
  }

  public static getLogs(sessionId?: string): ErrorAuditLog[] {
    if (sessionId) {
      return this.auditLogs.filter((l) => l.sessionId === sessionId);
    }
    return [...this.auditLogs];
  }

  public static clear(): void {
    this.auditLogs = [];
  }
}
