export interface CustomerMemoryRecord {
  id: string;
  tenantId: string;
  customerId: string;
  category: 'preference' | 'fact' | 'history' | 'protocol';
  fact: string;
  value: string;
  confidence: number;
  source: 'USER' | 'AGENT' | 'SYSTEM';
  createdAt: number;
  expiresAt?: number;
}
