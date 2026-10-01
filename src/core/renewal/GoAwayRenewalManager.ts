import { AuraSession, SessionContext } from '../../types';
import { AuraSessionManager } from '../session/AuraSessionManager';
import { ConnectionAuthority, ConnectionTicket } from '../connection/ConnectionAuthority';

export interface GoAwayEventPayload {
  auraSessionId: string;
  connectionId: string;
  connectionGeneration: number;
  timeRemaining?: string;
  timestamp: number;
}

export interface RenewalOptions {
  /**
   * Creates AND VERIFIES the replacement connection.
   * Must resolve true only once the replacement transport handshake completed.
   */
  onInitiateReplacement: (ticket: ConnectionTicket) => Promise<boolean>;
  onReplacementVerified?: (context: SessionContext, oldConnId: string, newConnId: string) => void;
  onRenewalFailed?: (context: SessionContext, error: string) => void;
}

/**
 * SECTION 08: GoAway Proactive Renewal Manager
 *
 * Foundational Invariants:
 * - Detects the provider `goAway` signal in advance of connection termination.
 * - Provisions a replacement BEFORE the current one dies.
 * - Session ID, persona, memory, and conversation state survive; no re-greeting.
 *
 * REGRESSION FIX (the production call-ending bug):
 * This manager previously computed its own connection generation with
 * `(activeSession.connectionGeneration || 1) + 1` while RecoveryManager independently
 * computed `(activeSession.connectionGeneration || 0) + 1`. When a goAway signal and a
 * watchdog stall landed in the same tick, both minted a generation-2 connection, and the
 * second one tore down the first. This manager now delegates identity allocation and
 * creation single-flight to the shared Connection Authority, and it holds its own lock
 * until the replacement is genuinely verified rather than returning true synchronously.
 */
export class GoAwayRenewalManager {
  private isRenewing = false;
  private lastGoAwayTimestamp = 0;
  private readonly authority: ConnectionAuthority;

  constructor(authority: ConnectionAuthority) {
    this.authority = authority;
  }

  public async handleGoAway(
    event: GoAwayEventPayload,
    activeSession: AuraSession | null,
    options: RenewalOptions
  ): Promise<boolean> {
    if (!activeSession) return false;

    const currentStatus = activeSession.status || activeSession.context.status;
    if (currentStatus === 'ENDING' || currentStatus === 'ENDED') {
      console.log(`[GoAwayRenewal] Ignored GoAway: session ${activeSession.sessionId} is already ending/ended.`);
      return false;
    }

    // Fence against a goAway belonging to a connection we already replaced.
    const activeConnId = activeSession.transport?.connectionId;
    const activeGen = activeSession.transport?.connectionGeneration ?? activeSession.transport?.generation;
    if (activeConnId && (activeConnId !== event.connectionId || activeGen !== event.connectionGeneration)) {
      console.log(
        `[GoAwayRenewal] Ignored stale GoAway event: conn=${event.connectionId} ` +
          `(current: ${activeConnId} gen ${activeGen})`
      );
      return false;
    }

    // Local lock: a renewal of ours is already running.
    if (this.isRenewing) {
      console.log(
        `[GoAwayRenewal] Renewal already in flight for session ${activeSession.sessionId}. ` +
          `Request will be coalesced by the Connection Authority.`
      );
    }

    this.isRenewing = true;
    this.lastGoAwayTimestamp = event.timestamp || Date.now();

    console.log(
      `[GoAwayRenewal] Initiating proactive renewal for connection ${event.connectionId} ` +
        `(Time remaining: ${event.timeRemaining || 'unspecified'}). Session ${activeSession.sessionId} remains ACTIVE.`
    );

    try {
      const oldConnId = event.connectionId;

      const outcome = await this.authority.requestReplacement('RENEWAL', async (ticket) => {
        const success = await options.onInitiateReplacement(ticket);
        if (!success) {
          throw new Error(`Replacement handshake failed for ${ticket.connectionId}`);
        }
        return true;
      });

      if (outcome.verified) {
        console.log(
          `[GoAwayRenewal] Replacement ${outcome.ticket.connectionId} ` +
            `(Gen ${outcome.ticket.generation}) verified. Swapping connection pointers.`
        );
        options.onReplacementVerified?.(activeSession.context, oldConnId, outcome.ticket.connectionId);
        return true;
      }

      const message = outcome.error || 'Renewal did not verify';
      console.error('[GoAwayRenewal] Proactive renewal failed:', message);
      options.onRenewalFailed?.(activeSession.context, message);
      return false;
    } catch (err: any) {
      const message = err?.message || 'Renewal error';
      console.error('[GoAwayRenewal] Proactive renewal failed:', message);
      options.onRenewalFailed?.(activeSession.context, message);
      return false;
    } finally {
      this.isRenewing = false;
    }
  }

  public isRenewalActive(): boolean {
    return this.isRenewing;
  }

  public getLastGoAwayTimestamp(): number {
    return this.lastGoAwayTimestamp;
  }

  public reset(): void {
    this.isRenewing = false;
    this.lastGoAwayTimestamp = 0;
  }
}
