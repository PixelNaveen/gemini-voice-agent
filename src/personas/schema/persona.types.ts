export type PriceType =
  | 'fixed'
  | 'starting_at'
  | 'complimentary'
  | 'menu_based'
  | 'quote_required';

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
  timezone: string; // IANA timezone (e.g. 'America/New_York')
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
  category?: string;
  durationMinutes: number;
  priceType: PriceType;
  price: number | null;
  priceNote?: string;
  description?: string;
  bookable: boolean;
  aliases: string[];
  prepNote?: string;
  availableOutsideHours?: boolean;
}

export interface ResourceConfig {
  id: string;
  name: string;
  type: string; // 'stylist' | 'operatory' | 'bay' | 'agent' | 'attorney' | 'table' | 'technician' | string
  title?: string;
  serviceIds: string[];
  capacity?: number;
}

export interface DiscountRule {
  id: string;
  name?: string;
  type?: 'percentage' | 'fixed' | string;
  value?: number;
  description?: string;
  code?: string;
  condition?: {
    minimumServices?: number;
    code?: string;
    firstTimeOnly?: boolean;
  };
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface SeededBusyItem {
  resourceId: string;
  days: string[]; // e.g. ['friday', 'saturday']
  start: string;  // "19:00"
  end: string;    // "21:00"
  label?: string;
  seatsTaken?: number;
}

export interface BusinessHoursInterval {
  open: string;
  close: string;
}

export interface DayScheduleConfig {
  intervals: BusinessHoursInterval[];
  closed?: boolean;
}

export interface EmergencyHoursConfig {
  alwaysOn: boolean;
  serviceIds?: string[];
  note?: string;
}

export interface HoursConfig {
  schedule: Record<string, DayScheduleConfig>;
  holidays?: string[];
  emergencyHours?: EmergencyHoursConfig;
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
  [key: string]: any;
}

export interface ContactPolicyConfig {
  required: string[];
  optional?: string[];
  collectNameEarly?: boolean;
  verifyEmail?: boolean;
  spellWhenLowConfidence?: boolean;
}

export interface BookingConfig {
  enabled: boolean;
  requiredEntities: string[];
  allowRescheduling: boolean;
  allowCancellation: boolean;
  confirmationRequired: boolean;
  minLeadHours: number;
  maxAdvanceDays?: number;
  bufferMinutes?: number;
}

export type EscalationAction =
  | 'call_911'
  | 'give_business_phone'
  | 'take_message'
  | 'book_emergency_service';

export interface EscalationTrigger {
  id: string;
  description: string;
  detectKeywords: string[];
  action: EscalationAction;
  scriptedLine?: string;
}

export interface EscalationConfig {
  enabled: boolean;
  triggers: EscalationTrigger[];
  emergencyTransfer?: boolean;
  defaultDepartment?: string;
}

export interface ConversationStyleConfig {
  tone: string;
  pace: string;
  fillerWords?: string[];
  greetingPhrase?: string;
  preferredPhrases?: string[];
  avoidPhrases?: string[];
}

export interface EmotionPlaybookItem {
  situation: string;
  empathy: string;
  action: string;
}

export interface PersonalityConfig {
  traits?: string[];
  slangTier?: number | string;
  fillerBudgetPerCall?: number;
  acknowledgements?: string[];
  register?: {
    avoid?: string[];
    use?: string[];
  };
  emotionPlaybook?: EmotionPlaybookItem[];
  [key: string]: any;
}

export interface ToolsConfig {
  allowed: string[];
  externalSearch?: boolean;
}

export interface SafetyPolicyItem {
  rule: string;
  action: string;
}

export interface SafetyConfig {
  policies: Record<string, SafetyPolicyItem | any>;
}

export interface PersonaDefinition {
  id: string;
  version: string;
  identity: IdentityConfig;
  business: BusinessConfig;
  services: ServiceItem[];
  resources: ResourceConfig[];
  hours: HoursConfig;
  policies: PoliciesConfig;
  discounts?: DiscountRule[];
  faqs?: FaqItem[];
  seededBusy?: SeededBusyItem[];
  contactPolicy: ContactPolicyConfig;
  booking: BookingConfig;
  escalation: EscalationConfig;
  conversationStyle: ConversationStyleConfig;
  personality?: PersonalityConfig;
  tools: ToolsConfig;
  safety: SafetyConfig;
  systemPrompt?: string;
  greetingPrompt?: string;
}

export interface RuntimePersonaContext {
  definition: PersonaDefinition;
  isAvailable: boolean;
  activePrompts: string[];
}
