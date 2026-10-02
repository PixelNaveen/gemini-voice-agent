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
    const trimmed = text.trim();
    if (!trimmed) {
      return this.messages[this.messages.length - 1] ?? {
        id: `msg_${Date.now()}`,
        sessionId: this.sessionId,
        personaId: this.personaId,
        role,
        text: '',
        timestamp: Date.now(),
        isFinal,
      };
    }

    const last = this.messages[this.messages.length - 1];
    const now = Date.now();

    // Stream Aggregation: If the last message was from the same speaker within the active turn (< 3.5s),
    // append the text chunk into the same unified message bubble rather than creating duplicate bubbles per word.
    if (last && last.role === role && (now - last.timestamp) < 3500) {
      if (trimmed.startsWith(last.text)) {
        last.text = trimmed;
      } else if (!last.text.includes(trimmed)) {
        last.text = last.text ? `${last.text} ${trimmed}` : trimmed;
      }
      last.timestamp = now;
      return last;
    }

    const msg: TranscriptMessage = {
      id: `msg_${now}_${Math.random().toString(36).substring(2, 6)}`,
      sessionId: this.sessionId,
      personaId: this.personaId,
      connectionId,
      role,
      text: trimmed,
      timestamp: now,
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
