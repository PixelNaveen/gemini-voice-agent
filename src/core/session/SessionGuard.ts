import { ActiveSession, SessionContext } from '../../types';

export class SessionGuard {
  public static isActive(
    context: SessionContext,
    activeSession: ActiveSession | null
  ): boolean {
    if (!activeSession) return false;
    const activeCtx = activeSession.context;

    return (
      context.sessionId === activeCtx.sessionId &&
      context.personaId === activeCtx.personaId &&
      context.generation === activeCtx.generation &&
      activeCtx.status !== 'ENDED' &&
      activeCtx.status !== 'ENDING'
    );
  }
}
