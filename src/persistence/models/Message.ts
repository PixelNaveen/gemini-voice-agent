export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

export interface MessageRecord {
  id: string;
  sessionId: string;
  tenantId: string;
  role: MessageRole;
  content: string;
  sequence: number;
  timestamp: number;
  metadata?: Record<string, any>;
}
