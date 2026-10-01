export interface ToolExecutionContext {
  sessionId: string;
  personaId: string;
  connectionId?: string;
  operationId: string;
  idempotencyKey?: string;
  timestamp: number;
  toolName: string;
  isConfirmedByUser?: boolean;
}

export type ToolErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'CONFLICT'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INTEGRATION_ERROR'
  /** A fault in our own dispatch path, distinct from a provider returning something unreadable. */
  | 'INTERNAL_ERROR'
  | 'UNKNOWN_ERROR';

export interface ToolError {
  code: ToolErrorCode;
  message: string;
  details?: Record<string, any>;
}

export interface ToolResult<T = any> {
  success: boolean;
  toolName: string;
  operationId: string;
  status: 'SUCCESS' | 'AVAILABLE' | 'UNAVAILABLE' | 'CONFLICT' | 'CONFIRMED' | 'FAILED';
  data?: T;
  error?: ToolError;
  /**
   * F-22: classification output carried alongside the result.
   *
   * This is where the error taxonomy reaches the live path. `auraCode` and `category` come
   * from `ErrorManager`, and `spokenMessage` is the caller-safe line the model may use. It is
   * attached here rather than returned as a separate value so that a result and its
   * classification cannot be separated or reordered on the way to the model.
   */
  details?: {
    auraCode?: string;
    category?: string;
    source?: string;
    retryable?: boolean;
    recoveryAction?: string;
    /** Text the caller may safely hear. Never a technical message. */
    spokenMessage?: string;
    [key: string]: unknown;
  };
  executedAt: number;
}
