export interface ConnectionRecord {
  id: string;
  sessionId: string;
  tenantId: string;
  generation: number;
  startedAt: number;
  endedAt?: number;
  closeReason?: string;
  reconnectAttempt: number;
  clientIp?: string;
  userAgent?: string;
}
