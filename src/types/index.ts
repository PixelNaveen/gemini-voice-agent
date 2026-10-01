export type AgentStatus = 'idle' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'muted' | 'error';

export type VisualizerMode = 'orb' | 'wave' | 'bars' | 'mesh';

export type AuraSessionStatus =
  | 'IDLE'
  | 'STARTING'
  | 'ACTIVE'
  | 'CONNECTED'
  | 'CONNECTING'
  | 'RECONNECTING'
  | 'RECOVERING'
  | 'ENDING'
  | 'ENDED'
  | 'FAILED';

export type SessionStatus = AuraSessionStatus;

export type GeminiConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'CLOSING'
  | 'CLOSED'
  | 'FAILED';

export type TransportStatus = GeminiConnectionStatus;

export type RecoveryStatus =
  | 'NONE'
  | 'SCHEDULED'
  | 'CONNECTING'
  | 'SUCCEEDED'
  | 'EXHAUSTED'
  | 'CANCELLED';

export type ConnectionCloseReason =
  | 'UNKNOWN'
  | 'USER'
  | 'PERSONA_SWITCH'
  | 'NETWORK'
  | 'UPSTREAM'
  | 'FATAL'
  | 'SESSION_END';

export type RecoveryDecision = 'RECONNECT' | 'END' | 'FAIL';

export type AudioInputStatus = 'UNKNOWN' | 'REQUESTING_PERMISSION' | 'READY' | 'BLOCKED' | 'ERROR';
export type AudioOutputStatus = 'READY' | 'BLOCKED' | 'ERROR';

export interface AudioState {
  input: AudioInputStatus;
  output: AudioOutputStatus;
}

export type EndReason =
  | 'USER_ENDED'
  | 'PERSONA_SWITCH'
  | 'TIME_LIMIT'
  | 'NETWORK_FAILURE'
  | 'FATAL_ERROR'
  | 'SYSTEM_SHUTDOWN';

/**
 * `COMPLETED` and `DELIVERED` both mean the caller has heard the introduction.
 *
 * `DELIVERED` was previously missing from this union, which is what allowed a resumed call to
 * look un-greeted: the session was rebuilt for a new connection and reset to `PENDING`, so the
 * agent re-introduced itself on a call already in progress (F-11). The server now reports
 * delivery explicitly, and the client records it rather than re-deriving it.
 */
export type GreetingState = 'PENDING' | 'SENT' | 'DELIVERED' | 'COMPLETED';

export interface TranscriptItem {
  id: string;
  speaker: 'user' | 'agent';
  text: string;
  timestamp: string;
  rawTime: number;
  isFinal?: boolean;
}

export interface ConversationFact {
  id: string;
  key: string;
  value: string;
  category: 'preference' | 'fact' | 'summary' | 'protocol' | 'custom';
  confidence: number;
  timestamp: string;
}

export interface MemoryFact {
  id: string;
  category: 'preference' | 'fact' | 'summary' | 'protocol' | 'custom';
  content: string;
  timestamp: string;
}

export interface SessionMemory {
  sessionId: string;
  personaId: string;
  messages: TranscriptItem[];
  facts: MemoryFact[];
}

export * from '../core/conversation';

import { ConversationRuntimeState } from '../core/conversation';

export type RuntimeConversationState = ConversationRuntimeState;

export interface ConnectionIdentity {
  sessionId: string;
  personaId: string;
  generation: number;
  connectionId: string;
  connectionGeneration: number;
}

/**
 * SECTION 07: Gemini Session Resumption State
 * Provider-side resumption information attached strictly to the disposable connection lifecycle.
 */
export interface GeminiResumptionState {
  handle: string | null;
  issuedAt: number | null;
  lastUpdatedAt: number | null;
  expiresAt: number | null;
  resumable: boolean;
}

/**
 * Gemini Live Connection model (Transport Layer)
 * Manages one individual low-level Gemini Live WebSocket connection.
 */
export interface GeminiConnection {
  connectionId: string;
  sessionId?: string;
  generation?: number;
  connectionGeneration?: number;
  status: GeminiConnectionStatus;
  model?: string;
  voice?: string;
  projectId?: string;
  reconnectAttempt?: number;
  recoveryStatus?: RecoveryStatus;
  closeReason?: ConnectionCloseReason;
  createdAt?: number;
  connectedAt?: number | null;
  disconnectedAt?: number | null;
  lastConnectedAt?: number | null;
  lastDisconnectedAt?: number | null;
  resumption?: GeminiResumptionState;
}

export type TransportState = GeminiConnection;

export interface SessionContext {
  sessionId: string;
  personaId: string;
  createdAt: number;
  status: AuraSessionStatus;
  generation: number;
  endReason?: EndReason;
}

export type AuraLifecycleEvent =
  | 'START_REQUEST'
  | 'START_SUCCESS'
  | 'START_FAILED'
  | 'GEMINI_FAILURE'
  | 'RECOVERY_REQUEST'
  | 'RECOVERY_SUCCESS'
  | 'RECOVERY_FAILED'
  | 'USER_END'
  | 'PERSONA_SWITCH'
  | 'END_COMPLETE'
  | 'NEW_SESSION_REQUEST';

export type GeminiTransportEvent =
  | 'CONNECT_REQUEST'
  | 'CONNECT_SUCCESS'
  | 'CONNECT_FAILED'
  | 'DISCONNECT'
  | 'CLOSE_REQUEST'
  | 'CLOSE_COMPLETE';

export interface StateTransitionLogEntry {
  event: string;
  from: string;
  to: string;
  reason: string;
  timestamp: number;
  generation: number;
}

export interface SessionLifecycleMetadata {
  generation: number;
  transitionId: string;
  startedAt: number;
  endedAt?: number;
  endReason?: EndReason;
  lastEvent?: AuraLifecycleEvent;
  lastEventReason?: string;
  transitionHistory: StateTransitionLogEntry[];
}

/**
 * AURA Session Model (Customer Call & Conversation Layer)
 * The customer's actual business interaction. Survives Gemini disconnections.
 */
export interface AuraSession {
  context: SessionContext;
  sessionId: string;
  personaId: string;
  persona: IndustryPreset;
  status: AuraSessionStatus;
  generation?: number;
  createdAt?: number;
  lastActivityAt?: number;
  endReason?: EndReason;
  activeConnectionId?: string | null;
  connectionGeneration?: number;
  transport: GeminiConnection;
  audio: AudioState;
  greeting: GreetingState;
  memory: SessionMemory;
  runtimeState: ConversationRuntimeState;
  lifecycle?: SessionLifecycleMetadata;
}

export type ActiveSession = AuraSession;

// Strict Authoritative Transition Tables (Section 03 Architecture)
export const AURA_STATE_TRANSITIONS: Record<
  AuraSessionStatus,
  Partial<Record<AuraLifecycleEvent, AuraSessionStatus>>
> = {
  IDLE: {
    START_REQUEST: 'STARTING',
    NEW_SESSION_REQUEST: 'STARTING',
  },
  STARTING: {
    START_SUCCESS: 'ACTIVE',
    START_FAILED: 'ENDING',
    USER_END: 'ENDING',
    PERSONA_SWITCH: 'ENDING',
  },
  ACTIVE: {
    GEMINI_FAILURE: 'RECOVERING',
    RECOVERY_REQUEST: 'RECOVERING',
    USER_END: 'ENDING',
    PERSONA_SWITCH: 'ENDING',
    START_FAILED: 'ENDING',
  },
  CONNECTED: {
    // Legacy alias for ACTIVE
    GEMINI_FAILURE: 'RECOVERING',
    RECOVERY_REQUEST: 'RECOVERING',
    USER_END: 'ENDING',
    PERSONA_SWITCH: 'ENDING',
    START_FAILED: 'ENDING',
  },
  CONNECTING: {
    // Legacy alias for STARTING
    START_SUCCESS: 'ACTIVE',
    START_FAILED: 'ENDING',
    USER_END: 'ENDING',
    PERSONA_SWITCH: 'ENDING',
  },
  RECONNECTING: {
    // Legacy alias for RECOVERING
    RECOVERY_SUCCESS: 'ACTIVE',
    RECOVERY_FAILED: 'ENDING',
    USER_END: 'ENDING',
    PERSONA_SWITCH: 'ENDING',
  },
  RECOVERING: {
    RECOVERY_SUCCESS: 'ACTIVE',
    RECOVERY_FAILED: 'ENDING',
    USER_END: 'ENDING',
    PERSONA_SWITCH: 'ENDING',
  },
  ENDING: {
    END_COMPLETE: 'ENDED',
    USER_END: 'ENDING', // Idempotent no-op
    PERSONA_SWITCH: 'ENDING', // Idempotent
  },
  ENDED: {
    NEW_SESSION_REQUEST: 'STARTING',
    START_REQUEST: 'STARTING',
  },
  FAILED: {
    NEW_SESSION_REQUEST: 'STARTING',
    START_REQUEST: 'STARTING',
    END_COMPLETE: 'ENDED',
  },
};

export const GEMINI_TRANSPORT_TRANSITIONS: Record<
  GeminiConnectionStatus,
  Partial<Record<GeminiTransportEvent, GeminiConnectionStatus>>
> = {
  DISCONNECTED: {
    CONNECT_REQUEST: 'CONNECTING',
    CLOSE_REQUEST: 'CLOSED',
    CLOSE_COMPLETE: 'CLOSED',
  },
  CONNECTING: {
    CONNECT_REQUEST: 'CONNECTING',
    CONNECT_SUCCESS: 'CONNECTED',
    CONNECT_FAILED: 'FAILED',
    CLOSE_REQUEST: 'CLOSING',
    DISCONNECT: 'CLOSED',
  },
  CONNECTED: {
    DISCONNECT: 'CLOSED',
    CLOSE_REQUEST: 'CLOSING',
    CONNECT_FAILED: 'FAILED',
  },
  RECONNECTING: {
    CONNECT_SUCCESS: 'CONNECTED',
    CONNECT_FAILED: 'FAILED',
    CLOSE_REQUEST: 'CLOSING',
    DISCONNECT: 'CLOSED',
  },
  CLOSING: {
    CLOSE_COMPLETE: 'CLOSED',
    DISCONNECT: 'CLOSED',
    CLOSE_REQUEST: 'CLOSING', // Idempotent
  },
  CLOSED: {
    CONNECT_REQUEST: 'CONNECTING',
  },
  FAILED: {
    CONNECT_REQUEST: 'CONNECTING',
    CLOSE_REQUEST: 'CLOSED',
  },
};

// Session State Transition Table (AURA Session Lifecycle)
const SESSION_TRANSITIONS: Record<AuraSessionStatus, AuraSessionStatus[]> = {
  IDLE: ['STARTING'],
  STARTING: ['ACTIVE', 'CONNECTED', 'CONNECTING', 'RECONNECTING', 'RECOVERING', 'FAILED', 'ENDING', 'IDLE'],
  CONNECTING: ['ACTIVE', 'CONNECTED', 'RECONNECTING', 'RECOVERING', 'FAILED', 'ENDING'],
  CONNECTED: ['ACTIVE', 'RECONNECTING', 'RECOVERING', 'ENDING', 'FAILED'],
  ACTIVE: ['RECOVERING', 'RECONNECTING', 'ENDING', 'FAILED'],
  RECONNECTING: ['ACTIVE', 'CONNECTED', 'RECOVERING', 'CONNECTING', 'ENDING', 'FAILED'],
  RECOVERING: ['ACTIVE', 'CONNECTED', 'CONNECTING', 'RECONNECTING', 'ENDING', 'FAILED'],
  ENDING: ['ENDED'],
  ENDED: ['IDLE', 'STARTING'],
  FAILED: ['ENDING', 'ENDED', 'IDLE'],
};

export function isValidSessionTransition(current: AuraSessionStatus, next: AuraSessionStatus): boolean {
  if (current === next) return true;
  return SESSION_TRANSITIONS[current]?.includes(next) ?? false;
}

export function transitionSessionStatus(current: AuraSessionStatus, next: AuraSessionStatus): AuraSessionStatus {
  if (!isValidSessionTransition(current, next)) {
    console.warn(`[State Machine Warning] Invalid Session transition: ${current} → ${next}`);
  }
  return next;
}

// Transport / Gemini Connection State Transition Table
const TRANSPORT_TRANSITIONS: Record<GeminiConnectionStatus, GeminiConnectionStatus[]> = {
  DISCONNECTED: ['CONNECTING', 'RECONNECTING'],
  CONNECTING: ['CONNECTED', 'FAILED', 'CLOSING', 'CLOSED', 'RECONNECTING', 'DISCONNECTED'],
  CONNECTED: ['RECONNECTING', 'CLOSING', 'CLOSED', 'FAILED', 'DISCONNECTED'],
  RECONNECTING: ['CONNECTING', 'CONNECTED', 'CLOSING', 'CLOSED', 'FAILED'],
  CLOSING: ['CLOSED', 'DISCONNECTED'],
  CLOSED: ['CONNECTING', 'DISCONNECTED'],
  FAILED: ['CLOSING', 'CLOSED', 'DISCONNECTED', 'CONNECTING'],
};

export function isValidTransportTransition(current: TransportStatus, next: TransportStatus): boolean {
  if (current === next) return true;
  return TRANSPORT_TRANSITIONS[current]?.includes(next) ?? false;
}

export function transitionTransportStatus(current: TransportStatus, next: TransportStatus): TransportStatus {
  if (!isValidTransportTransition(current, next)) {
    console.warn(`[State Machine Warning] Invalid Transport transition: ${current} → ${next}`);
  }
  return next;
}

export function isSessionActive(
  context: SessionContext,
  activeContext: SessionContext | null
): boolean {
  if (!activeContext) {
    return false;
  }

  return (
    context.sessionId === activeContext.sessionId &&
    context.personaId === activeContext.personaId &&
    context.generation === activeContext.generation &&
    activeContext.status !== 'ENDED' &&
    activeContext.status !== 'ENDING'
  );
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'Female' | 'Male';
  accent: string;
  description: string;
  speed: string;
  isDefault?: boolean;
}

export interface IndustryPreset {
  id: string;
  name: string;
  businessName: string;
  iconName: string;
  badge: string;
  description: string;
  systemPrompt: string;
  greetingPrompt: string;
  sampleQueries: string[];
}

export { ALL_PERSONAS as INDUSTRY_PRESETS, getPersonaById, DEFAULT_PERSONA } from '../personas';

export const AVAILABLE_VOICES: VoiceOption[] = [
  {
    id: 'Kore',
    name: 'Kore',
    gender: 'Female',
    accent: 'American (US)',
    description: 'Ultra-fast, crisp, performant female voice with warm natural intonation.',
    speed: 'Ultra-Fast (Recommended)',
    isDefault: true,
  },
  {
    id: 'Aoede',
    name: 'Aoede',
    gender: 'Female',
    accent: 'American (US)',
    description: 'Deep, conversational, smooth female voice for storytelling.',
    speed: 'Fast',
  },
  {
    id: 'Zephyr',
    name: 'Zephyr',
    gender: 'Male',
    accent: 'American (US)',
    description: 'Energetic, articulate male voice with bright audio presence.',
    speed: 'Fast',
  },
  {
    id: 'Puck',
    name: 'Puck',
    gender: 'Male',
    accent: 'American (US)',
    description: 'Warm, friendly, approachable male voice for daily interaction.',
    speed: 'Fast',
  },
  {
    id: 'Charon',
    name: 'Charon',
    gender: 'Male',
    accent: 'American (US)',
    description: 'Deep authoritative male voice with rich bass acoustics.',
    speed: 'Moderate',
  },
];
