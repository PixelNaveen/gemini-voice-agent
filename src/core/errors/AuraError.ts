import { ErrorCategory, ErrorSource } from './ErrorCategory';
import { ErrorCode } from './ErrorCode';

export interface AuraErrorPayload {
  code: ErrorCode | string;
  category: ErrorCategory;
  source: ErrorSource;
  message: string;
  retryable: boolean;
  sessionId?: string;
  personaId?: string;
  connectionId?: string;
  operationId?: string;
  cause?: unknown;
  timestamp?: number;
}

export class AuraError extends Error {
  public readonly code: ErrorCode | string;
  public readonly category: ErrorCategory;
  public readonly source: ErrorSource;
  public readonly retryable: boolean;
  public readonly sessionId?: string;
  public readonly personaId?: string;
  public readonly connectionId?: string;
  public readonly operationId?: string;
  public override readonly cause?: unknown;
  public readonly timestamp: number;

  constructor(payload: AuraErrorPayload) {
    super(payload.message);
    this.name = 'AuraError';
    this.code = payload.code;
    this.category = payload.category;
    this.source = payload.source;
    this.retryable = payload.retryable;
    this.sessionId = payload.sessionId;
    this.personaId = payload.personaId;
    this.connectionId = payload.connectionId;
    this.operationId = payload.operationId;
    this.cause = payload.cause;
    this.timestamp = payload.timestamp || Date.now();
  }

  public toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      source: this.source,
      message: this.message,
      retryable: this.retryable,
      sessionId: this.sessionId,
      personaId: this.personaId,
      connectionId: this.connectionId,
      operationId: this.operationId,
      timestamp: this.timestamp,
    };
  }
}
