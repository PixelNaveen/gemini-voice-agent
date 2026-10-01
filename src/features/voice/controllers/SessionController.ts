import { SessionStore } from '../../../state/session/SessionStore';
import { SessionService } from '../../../application/sessions/SessionService';
import { PersonaRegistry } from '../../../personas/PersonaRegistry';

export class SessionController {
  private static timerInterval: NodeJS.Timeout | null = null;
  private static readonly DEMO_DURATION_SECONDS = 300; // 5-minute session limit

  public static async startSession(personaId: string, tenantId = 'tenant_aura_salon'): Promise<string> {
    this.stopTimer();

    const persona = PersonaRegistry.get(personaId);
    const sessionDto = await SessionService.createSession({
      tenantId,
      personaId: persona.id,
    });

    SessionStore.setState({
      sessionId: sessionDto.sessionId,
      personaId: persona.id,
      personaVersion: persona.version,
      sessionStatus: 'CONNECTED',
      connectionStatus: 'CONNECTED',
      timerSecondsRemaining: this.DEMO_DURATION_SECONDS,
      currentIntent: null,
      conversationStage: 'GREETING',
      bookingStatus: 'IDLE',
    });

    this.startTimer(sessionDto.sessionId, tenantId);
    return sessionDto.sessionId;
  }

  public static async endSession(reason = 'USER_ENDED', tenantId = 'tenant_aura_salon'): Promise<void> {
    const current = SessionStore.getState();
    this.stopTimer();

    if (current.sessionId) {
      await SessionService.endSession(current.sessionId, tenantId, reason);
    }

    SessionStore.setState({
      sessionStatus: 'ENDED',
      connectionStatus: 'DISCONNECTED',
      isAgentSpeaking: false,
      isUserSpeaking: false,
    });
  }

  public static async switchPersona(newPersonaId: string, tenantId = 'tenant_aura_salon'): Promise<void> {
    console.log(`[SessionController] Performing hard reset and switching to persona: ${newPersonaId}`);
    await this.endSession('PERSONA_SWITCH', tenantId);
    SessionStore.reset();
    await this.startSession(newPersonaId, tenantId);
  }

  private static startTimer(sessionId: string, tenantId: string): void {
    let remaining = this.DEMO_DURATION_SECONDS;

    this.timerInterval = setInterval(async () => {
      remaining--;
      const current = SessionStore.getState();

      if (current.sessionId !== sessionId) {
        this.stopTimer();
        return;
      }

      if (remaining <= 30 && remaining > 0 && current.sessionStatus !== 'ENDING_SOON') {
        SessionStore.setState({
          timerSecondsRemaining: remaining,
          sessionStatus: 'ENDING_SOON',
        });
      } else if (remaining <= 0) {
        this.stopTimer();
        SessionStore.setState({
          timerSecondsRemaining: 0,
          sessionStatus: 'ENDED',
          connectionStatus: 'DISCONNECTED',
        });
        await SessionService.endSession(sessionId, tenantId, 'TIME_LIMIT');
      } else {
        SessionStore.setState({ timerSecondsRemaining: remaining });
      }
    }, 1000);
  }

  private static stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}
