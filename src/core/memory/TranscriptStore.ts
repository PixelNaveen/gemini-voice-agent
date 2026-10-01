export interface TranscriptMessage {
  id: string;
  sessionId: string;
  personaId: string;
  connectionId?: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  text: string;
  timestamp: number;
  isFinal?: boolean;
}

export class TranscriptStore {
  private messages: TranscriptMessage[] = [];
  private sessionId: string;
  private personaId: string;

  constructor(sessionId: string, personaId: string) {
    this.sessionId = sessionId;
    this.personaId = personaId;
  }

  public addMessage(
    role: 'user' | 'assistant' | 'tool' | 'system',
    text: string,
    connectionId?: string,
    isFinal = true
  ): TranscriptMessage {
    const msg: TranscriptMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sessionId: this.sessionId,
      personaId: this.personaId,
      connectionId,
      role,
      text: text.trim(),
      timestamp: Date.now(),
      isFinal,
    };
    this.messages.push(msg);
    return msg;
  }

  public getRecent(limit = 10): TranscriptMessage[] {
    return this.messages.slice(-limit);
  }

  public getAll(): TranscriptMessage[] {
    return [...this.messages];
  }

  public clear(): void {
    this.messages = [];
  }

  public formatForModel(limit = 10): string {
    const recent = this.getRecent(limit);
    if (recent.length === 0) return 'No recent conversational turns.';
    return recent
      .map((m) => `[${m.role.toUpperCase()}]: ${m.text}`)
      .join('\n');
  }
}
