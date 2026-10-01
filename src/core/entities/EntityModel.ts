export type EntityStatus = 'UNKNOWN' | 'TENTATIVE' | 'CONFIRMED' | 'REJECTED';
export type EntitySource = 'USER' | 'TOOL' | 'SYSTEM' | 'INFERRED' | 'MEMORY';

export interface EntityHistoryEntry<T> {
  value: T;
  status: EntityStatus;
  timestamp: number;
}

export interface EntityValue<T> {
  value: T;
  status: EntityStatus;
  confidence: number;
  source: EntitySource;
  rawText?: string;
  updatedAt: number;
  history?: EntityHistoryEntry<T>[];
}

export interface NormalizedDate {
  iso: string; // e.g., "2026-10-02"
  display: string; // e.g., "Friday, October 2, 2026"
  isTentative?: boolean;
}

export interface NormalizedTime {
  time24: string; // e.g., "14:00"
  display: string; // e.g., "2:00 PM"
  isApproximate?: boolean;
  flexibilityMinutes?: number;
}

export interface ConversationEntities {
  customerName?: EntityValue<string>;
  email?: EntityValue<string>;
  phone?: EntityValue<string>;
  service?: EntityValue<string>;
  date?: EntityValue<NormalizedDate>;
  time?: EntityValue<NormalizedTime>;
  timeRange?: EntityValue<'MORNING' | 'AFTERNOON' | 'EVENING' | 'ANY'>;
  staff?: EntityValue<string>;
  location?: EntityValue<string>;
  partySize?: EntityValue<number>;
  specialRequest?: EntityValue<string>;
  vehicleInfo?: EntityValue<string>;
  symptoms?: EntityValue<string>;
  quotedPrice?: EntityValue<string>;
}

export function createEntity<T>(
  value: T,
  confidence = 0.9,
  status: EntityStatus = 'TENTATIVE',
  source: EntitySource = 'USER',
  rawText?: string
): EntityValue<T> {
  return {
    value,
    confidence,
    status,
    source,
    rawText,
    updatedAt: Date.now(),
    history: [{ value, status, timestamp: Date.now() }],
  };
}

export function updateEntityValue<T>(
  existing: EntityValue<T> | undefined,
  newValue: T,
  confidence = 0.9,
  status: EntityStatus = 'TENTATIVE',
  source: EntitySource = 'USER',
  rawText?: string
): EntityValue<T> {
  const history = existing?.history ? [...existing.history] : [];
  if (existing) {
    history.push({ value: existing.value, status: existing.status, timestamp: existing.updatedAt });
  }

  return {
    value: newValue,
    confidence,
    status,
    source,
    rawText,
    updatedAt: Date.now(),
    history,
  };
}

export function rejectEntity<T>(existing: EntityValue<T>): EntityValue<T> {
  const history = existing.history ? [...existing.history] : [];
  history.push({ value: existing.value, status: 'REJECTED', timestamp: Date.now() });

  return {
    ...existing,
    status: 'REJECTED',
    updatedAt: Date.now(),
    history,
  };
}
