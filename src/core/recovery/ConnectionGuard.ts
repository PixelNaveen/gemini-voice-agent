import { SessionContext, ActiveSession, AuraSession } from '../../types';

export interface StaleCallbackLogPayload {
  session: string;
  callbackType: string;
  callbackConnection?: string | null;
  callbackGeneration?: number;
  currentConnection?: string | null;
  currentGeneration?: number;
  action: 'IGNORED' | 'DROPPED';
}

export class ConnectionGuard {
  /**
   * SECTION 06: Diagnostics logging for stale callbacks.
   */
  public static logStaleCallback(details: StaleCallbackLogPayload): void {
    console.log(
      `[StaleCallback] session=${details.session} callbackType=${details.callbackType} callbackConnection=${
        details.callbackConnection || 'none'
      } callbackGeneration=${details.callbackGeneration ?? 'none'} currentConnection=${
        details.currentConnection || 'none'
      } currentGeneration=${details.currentGeneration ?? 'none'} action=${details.action}`
    );
  }

  /**
   * Retrieves current session generation token.
   */
  public static getCurrentSessionGeneration(session: AuraSession | null): number {
    if (!session) return 0;
    return session.generation ?? session.context?.generation ?? 0;
  }

  /**
   * Retrieves current connection generation token.
   */
  public static getCurrentConnectionGeneration(session: AuraSession | null): number {
    if (!session || !session.transport) return 0;
    return session.transport.connectionGeneration ?? session.transport.generation ?? 0;
  }

  /**
   * Validates whether a callback belongs to the current AURA session generation.
   */
  public static isSessionCurrent(session: AuraSession | null, generation: number): boolean {
    if (!session) return false;
    const current = ConnectionGuard.getCurrentSessionGeneration(session);
    return current === generation;
  }

  /**
   * Validates whether a connection callback belongs to the authoritative current connection.
   */
  public static isConnectionCurrent(
    session: AuraSession | null,
    connectionId: string | null,
    connectionGeneration: number
  ): boolean {
    if (!session || !session.transport) return false;
    const currentId = session.transport.connectionId;
    const currentGen = ConnectionGuard.getCurrentConnectionGeneration(session);

    if (connectionId && currentId && connectionId !== currentId) {
      ConnectionGuard.logStaleCallback({
        session: session.sessionId,
        callbackType: 'CONNECTION_MISMATCH',
        callbackConnection: connectionId,
        callbackGeneration: connectionGeneration,
        currentConnection: currentId,
        currentGeneration: currentGen,
        action: 'IGNORED',
      });
      return false;
    }

    if (connectionGeneration !== currentGen) {
      ConnectionGuard.logStaleCallback({
        session: session.sessionId,
        callbackType: 'GENERATION_MISMATCH',
        callbackConnection: connectionId,
        callbackGeneration: connectionGeneration,
        currentConnection: currentId,
        currentGeneration: currentGen,
        action: 'IGNORED',
      });
      return false;
    }

    return true;
  }

  /**
   * Validates whether a recovery operation callback is still authoritative.
   */
  public static isRecoveryCurrent(
    currentOpId: string | null,
    currentOpGeneration: number | null,
    callbackOpId: string,
    callbackGeneration: number
  ): boolean {
    if (!currentOpId) return false;
    return currentOpId === callbackOpId && (currentOpGeneration === null || currentOpGeneration === callbackGeneration);
  }

  /**
   * Validates if an event from a connection generation matches the active session.
   */
  public static validateEvent(
    eventContext: { sessionId: string; connectionId?: string | null; personaId?: string } | SessionContext,
    connectionId?: string | null,
    connectionGeneration?: number,
    activeSession?: ActiveSession | null
  ): boolean {
    if (!activeSession) return false;
    if (eventContext.sessionId !== activeSession.context.sessionId) {
      return false;
    }
    const activeGen = activeSession.transport?.connectionGeneration ?? activeSession.transport?.generation;
    if (
      activeSession.transport &&
      activeGen !== undefined &&
      connectionGeneration !== undefined &&
      connectionGeneration !== activeGen
    ) {
      ConnectionGuard.logStaleCallback({
        session: eventContext.sessionId,
        callbackType: 'EVENT_GENERATION_MISMATCH',
        callbackConnection: connectionId,
        callbackGeneration: connectionGeneration,
        currentConnection: activeSession.transport?.connectionId,
        currentGeneration: activeGen,
        action: 'IGNORED',
      });
      return false;
    }
    if (
      activeSession.transport &&
      activeSession.transport.connectionId !== null &&
      connectionId &&
      connectionId !== activeSession.transport.connectionId
    ) {
      ConnectionGuard.logStaleCallback({
        session: eventContext.sessionId,
        callbackType: 'EVENT_CONNECTION_MISMATCH',
        callbackConnection: connectionId,
        callbackGeneration: connectionGeneration,
        currentConnection: activeSession.transport.connectionId,
        currentGeneration: activeGen,
        action: 'IGNORED',
      });
      return false;
    }
    return true;
  }

  /**
   * SECTION 07: Handoff-phase validation.
   *
   * `validateEvent` is correct for traffic from the CURRENT connection, but it cannot be
   * used to vet a replacement socket before promotion: the session transport still points
   * at the outgoing connection, so a replacement ticket would always look like a
   * generation/connection mismatch and the handoff would be rejected before it started.
   *
   * This validator is the pre-promotion equivalent. It requires:
   *   - the same AURA session,
   *   - a ticket the ConnectionAuthority still recognises (in flight, or already current),
   *   - a generation that is NOT older than the current transport, so a retired ticket can
   *     never come back to life,
   *   - and, once the authority reports the ticket as CURRENT, an exact match with the
   *     session transport.
   */
  public static validateHandoffEvent(
    eventContext: { sessionId: string },
    ticket: { connectionId: string; generation: number },
    activeSession: ActiveSession | null,
    authority: { inFlight: boolean; current: boolean }
  ): boolean {
    if (!activeSession) return false;
    if (eventContext.sessionId !== activeSession.context.sessionId) return false;

    const recognised = authority.inFlight || authority.current;
    if (!recognised) {
      ConnectionGuard.logStaleCallback({
        session: eventContext.sessionId,
        callbackType: 'UNRECOGNISED_TICKET',
        callbackConnection: ticket.connectionId,
        callbackGeneration: ticket.generation,
        currentConnection: activeSession.transport?.connectionId,
        currentGeneration: activeSession.transport?.connectionGeneration,
        action: 'DROPPED',
      });
      return false;
    }

    const activeGen = activeSession.transport?.connectionGeneration ?? activeSession.transport?.generation;
    if (activeGen !== undefined && ticket.generation < activeGen) {
      ConnectionGuard.logStaleCallback({
        session: eventContext.sessionId,
        callbackType: 'HANDOFF_GENERATION_TOO_OLD',
        callbackConnection: ticket.connectionId,
        callbackGeneration: ticket.generation,
        currentConnection: activeSession.transport?.connectionId,
        currentGeneration: activeGen,
        action: 'DROPPED',
      });
      return false;
    }

    // Once promoted, the session transport must agree exactly.
    if (authority.current) {
      if (activeSession.transport && activeSession.transport.connectionId !== ticket.connectionId) {
        ConnectionGuard.logStaleCallback({
          session: eventContext.sessionId,
          callbackType: 'HANDOFF_CONNECTION_MISMATCH',
          callbackConnection: ticket.connectionId,
          callbackGeneration: ticket.generation,
          currentConnection: activeSession.transport.connectionId,
          currentGeneration: activeGen,
          action: 'DROPPED',
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluates whether an asynchronous callback or event belongs to the currently active session generation.
   */
  public static isCurrent(
    currentSessionId: string,
    currentGeneration: number,
    currentConnectionId: string,
    eventSessionId?: string,
    eventGeneration?: number,
    eventConnectionId?: string
  ): boolean {
    if (eventSessionId && eventSessionId !== currentSessionId) {
      console.warn(`[ConnectionGuard] Stale sessionId rejected: ${eventSessionId} (current: ${currentSessionId})`);
      return false;
    }
    if (eventGeneration !== undefined && eventGeneration !== currentGeneration) {
      console.warn(`[ConnectionGuard] Stale generation rejected: ${eventGeneration} (current: ${currentGeneration})`);
      return false;
    }
    if (eventConnectionId && eventConnectionId !== currentConnectionId) {
      console.warn(`[ConnectionGuard] Stale connectionId rejected: ${eventConnectionId} (current: ${currentConnectionId})`);
      return false;
    }
    return true;
  }
}
