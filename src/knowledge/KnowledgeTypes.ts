export type KnowledgeSource =
  | 'LIVE_TOOL'
  | 'BUSINESS_CONFIG'
  | 'BUSINESS_KB'
  | 'EXTERNAL_SEARCH'
  | 'MODEL';

export const SOURCE_AUTHORITY_HIERARCHY: Record<KnowledgeSource, number> = {
  LIVE_TOOL: 100, // Highest authority for dynamic business state (Availability, Bookings)
  BUSINESS_CONFIG: 80, // High authority for static business facts (Prices, Hours, Policies)
  BUSINESS_KB: 60, // Approved business knowledge base and FAQs
  EXTERNAL_SEARCH: 40, // Google Search Grounding evidence
  MODEL: 20, // General LLM internal knowledge
};

export type KnowledgeStatus =
  | 'KNOWN'
  | 'UNCERTAIN'
  | 'UNKNOWN'
  | 'REQUIRES_TOOL'
  | 'REQUIRES_HUMAN'
  | 'OUT_OF_SCOPE';

export interface KnowledgeFact<T = any> {
  key: string;
  value: T;
  source: KnowledgeSource;
  confidence: number;
  authority: number;
  retrievedAt: number;
  ttlMs?: number; // Time-to-live for dynamic facts
  rawAttribution?: string;
}
