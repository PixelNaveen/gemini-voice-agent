export interface AuditRecord {
  id: string;
  tenantId: string;
  actorId?: string;
  actorType: 'USER' | 'AGENT' | 'SYSTEM';
  action: string;
  resource: string;
  resourceId: string;
  details?: Record<string, any>;
  timestamp: number;
}
