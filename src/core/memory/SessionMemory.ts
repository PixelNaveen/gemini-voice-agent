export interface SessionFact {
  id: string;
  category: 'preference' | 'fact' | 'summary' | 'protocol' | 'custom';
  content: string;
  source: 'USER' | 'TOOL' | 'SYSTEM' | 'INFERRED';
  timestamp: number;
}

export interface CustomerMemory {
  name?: string;
  email?: string;
  phone?: string;
  preferences: Record<string, string>;
  notes: string[];
  lastInteractionAt: number;
}

export interface StructuredMemoryState {
  sessionId: string;
  personaId: string;
  sessionFacts: SessionFact[];
  customerMemory: CustomerMemory;
}

export const INITIAL_CUSTOMER_MEMORY: CustomerMemory = {
  preferences: {},
  notes: [],
  lastInteractionAt: Date.now(),
};
