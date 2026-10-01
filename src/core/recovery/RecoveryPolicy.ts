import { ConnectionCloseReason, RecoveryDecision, RecoveryStatus } from '../../types';

export const RECOVERY_CONFIG = {
  MAX_RECONNECT_ATTEMPTS: 3,
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 6000,
  JITTER_MS: 250,
} as const;

export interface RecoveryLogEntry {
  event: 'CONNECTION_LOST' | 'RECONNECT_SCHEDULED' | 'RECONNECT_STARTED' | 'RECONNECT_SUCCESS' | 'RECONNECT_FAILED' | 'RECOVERY_EXHAUSTED' | 'RECOVERY_CANCELLED';
  sessionId: string;
  personaId: string;
  connectionId: string;
  connectionGeneration: number;
  attempt: number;
  reason: ConnectionCloseReason;
  timestamp: number;
  details?: string;
}

/**
 * Classifies whether an unexpected failure/closure should trigger reconnection, fail immediately, or do nothing.
 */
export function classifyConnectionFailure(
  closeReason: ConnectionCloseReason,
  errorMessage?: string
): RecoveryDecision {
  if (closeReason === 'USER' || closeReason === 'PERSONA_SWITCH' || closeReason === 'SESSION_END') {
    return 'END';
  }

  if (closeReason === 'FATAL') {
    return 'FAIL';
  }

  if (errorMessage) {
    const lower = errorMessage.toLowerCase();
    if (
      lower.includes('invalid api key') ||
      lower.includes('unauthorized') ||
      lower.includes('permission_denied') ||
      lower.includes('unauthenticated') ||
      lower.includes('unsupported')
    ) {
      return 'FAIL';
    }
  }

  // Network or upstream disconnects are recoverable
  return 'RECONNECT';
}

/**
 * Calculates exponential backoff delay with jitter.
 */
export function calculateBackoffDelay(attempt: number): number {
  const base = Math.min(
    RECOVERY_CONFIG.BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1)),
    RECOVERY_CONFIG.MAX_DELAY_MS
  );
  const jitter = Math.random() * RECOVERY_CONFIG.JITTER_MS;
  return Math.round(base + jitter);
}
