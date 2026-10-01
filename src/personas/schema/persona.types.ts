export interface IdentityConfig {
  name: string;
  role: string;
  businessName: string;
  description: string;
  tagline?: string;
}

export interface BusinessLocation {
  address: string;
  city: string;
  state?: string;
  country: string;
  postalCode?: string;
}

export interface BusinessConfig {
  name: string;
  timezone: string; // IANA timezone (e.g., 'America/New_York')
  location: BusinessLocation;
  contact: {
    email: string;
    phone: string;
    website?: string;
  };
}

export interface ServiceItem {
  id: string;
  name: string;
  durationMinutes: number;
  description?: string;
  category?: string;
}

export interface DiscountRule {
  id: string;
  type: 'percentage' | 'fixed';
  value: number;
  condition: {
    minimumServices?: number;
    code?: string;
  };
}

export interface PricingConfig {
  currency: string;
  services: Record<string, number | string>;
  discounts?: DiscountRule[];
}

export interface DayScheduleConfig {
  intervals: { open: string; close: string }[];
  closed?: boolean;
}

export interface HoursConfig {
  schedule: Record<string, DayScheduleConfig>;
  holidays?: string[];
}

export interface PoliciesConfig {
  cancellation: {
    minimumNoticeHours: number;
    fee?: string;
  };
  rescheduling: {
    allowed: boolean;
    minimumNoticeHours?: number;
  };
  lateArrival?: {
    allowedMinutes: number;
  };
}

export interface ContactPolicyConfig {
  required: ('name' | 'email' | 'phone' | 'service' | 'date' | 'time' | 'partySize' | 'vehicleInfo')[];
  optional: string[];
  collectNameEarly: boolean;
  verifyEmail: boolean;
  spellWhenLowConfidence?: boolean;
}

export interface BookingConfig {
  enabled: boolean;
  requiredEntities: string[];
  allowRescheduling: boolean;
  allowCancellation: boolean;
  confirmationRequired: boolean;
  minNoticeHours?: number;
  maxAdvanceDays?: number;
  bufferMinutes?: number;
}

export interface EscalationConfig {
  enabled: boolean;
  triggers: string[];
  emergencyTransfer: boolean;
  defaultDepartment?: string;
}

export interface KnowledgeConfig {
  businessFacts: boolean;
  externalSearch: {
    enabled: boolean;
    strictBusinessAuthority: boolean;
  };
  sources: string[];
}

export interface ConversationStyleConfig {
  tone: 'warm' | 'clinical' | 'concise' | 'authoritative' | 'friendly';
  formality: 'casual' | 'professional' | 'formal';
  verbosity: 'ultra-concise' | 'concise' | 'detailed';
  useBusinessName: boolean;
  greetingPhrase?: string;
}

export interface ToolPolicyConfig {
  allowed: string[];
}

export interface SafetyPolicyConfig {
  medicalAdvice: boolean;
  legalAdvice: boolean;
  diagnosis: boolean;
  financialCommitments: boolean;
}

export interface PersonaDefinition {
  id: string;
  version: string;
  identity: IdentityConfig;
  business: BusinessConfig;
  services: ServiceItem[];
  pricing: PricingConfig;
  hours: HoursConfig;
  policies: PoliciesConfig;
  contactPolicy: ContactPolicyConfig;
  booking: BookingConfig;
  escalation: EscalationConfig;
  knowledge: KnowledgeConfig;
  conversationStyle: ConversationStyleConfig;
  tools: ToolPolicyConfig;
  safety: SafetyPolicyConfig;
  systemPrompt?: string;
  greetingPrompt?: string;
}

export interface RuntimePersonaContext {
  personaId: string;
  version: string;
  sessionId: string;
  definition: Readonly<PersonaDefinition>;
  loadedAt: number;
}
