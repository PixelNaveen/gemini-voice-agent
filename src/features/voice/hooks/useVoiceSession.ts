import { useState, useEffect } from 'react';
import { SessionStore, SessionViewState } from '../../../state/session/SessionStore';
import { SessionController } from '../controllers/SessionController';

export function useVoiceSession() {
  const [sessionState, setSessionState] = useState<SessionViewState>(SessionStore.getState());

  useEffect(() => {
    const unsubscribe = SessionStore.subscribe((newState) => {
      setSessionState(newState);
    });
    return unsubscribe;
  }, []);

  const start = async (personaId: string) => {
    return await SessionController.startSession(personaId);
  };

  const end = async (reason = 'USER_ENDED') => {
    await SessionController.endSession(reason);
  };

  const switchPersona = async (newPersonaId: string) => {
    await SessionController.switchPersona(newPersonaId);
  };

  return {
    ...sessionState,
    start,
    end,
    switchPersona,
  };
}
