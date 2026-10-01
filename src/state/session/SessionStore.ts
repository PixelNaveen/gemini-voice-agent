export interface SessionViewState {
  sessionId: string | null;
  personaId: string;
  personaVersion: string;
  sessionStatus: 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ENDING_SOON' | 'ENDED' | 'FAILED';
  connectionStatus: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'FAILED';
  timerSecondsRemaining: number;
  isAgentSpeaking: boolean;
  isUserSpeaking: boolean;
  currentIntent: string | null;
  conversationStage: string;
  bookingStatus: 'IDLE' | 'CHECKING_AVAILABILITY' | 'CONFIRMING' | 'CONFIRMED' | 'UNKNOWN' | 'FAILED';
}

export class SessionStore {
  private static state: SessionViewState = {
    sessionId: null,
    personaId: 'aura-salon',
    personaVersion: '1.0.0',
    sessionStatus: 'IDLE',
    connectionStatus: 'DISCONNECTED',
    timerSecondsRemaining: 300,
    isAgentSpeaking: false,
    isUserSpeaking: false,
    currentIntent: null,
    conversationStage: 'GREETING',
    bookingStatus: 'IDLE',
  };

  private static listeners: ((state: SessionViewState) => void)[] = [];

  public static getState(): SessionViewState {
    return { ...this.state };
  }

  public static setState(partial: Partial<SessionViewState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[SessionStore] Listener error:', err);
      }
    }
  }

  public static subscribe(listener: (state: SessionViewState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public static reset(): void {
    this.setState({
      sessionId: null,
      sessionStatus: 'IDLE',
      connectionStatus: 'DISCONNECTED',
      timerSecondsRemaining: 300,
      isAgentSpeaking: false,
      isUserSpeaking: false,
      currentIntent: null,
      conversationStage: 'GREETING',
      bookingStatus: 'IDLE',
    });
  }
}
