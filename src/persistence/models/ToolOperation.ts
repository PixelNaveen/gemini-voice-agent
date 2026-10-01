export type ToolOpStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'UNKNOWN'
  | 'RECONCILING'
  | 'CANCELLED';

export interface ToolOperationRecord {
  id: string;
  tenantId: string;
  sessionId: string;
  personaId: string;
  toolName: string;
  status: ToolOpStatus;
  idempotencyKey: string;
  payload: Record<string, any>;
  result?: Record<string, any>;
  error?: string;
  requestedAt: number;
  completedAt?: number;
}
