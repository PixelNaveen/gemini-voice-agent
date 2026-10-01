export type SessionDbStatus =
  | 'INITIALIZING'
  | 'CONNECTED'
  | 'ACTIVE'
  | 'RECONNECTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ENDED';

export interface SessionRecord {
  id: string;
  tenantId: string;
  userId?: string;
  customerId?: string;
  personaId: string;
  personaVersion: string;
  status: SessionDbStatus;
  endReason?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}
