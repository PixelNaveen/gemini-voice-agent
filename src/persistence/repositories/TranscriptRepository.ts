import { MessageRecord } from '../models/Message';

export class TranscriptRepository {
  private static messages: Map<string, MessageRecord> = new Map();

  public static async appendMessage(msg: MessageRecord): Promise<MessageRecord> {
    this.messages.set(msg.id, { ...msg });
    return msg;
  }

  public static async getBySession(sessionId: string): Promise<MessageRecord[]> {
    return Array.from(this.messages.values())
      .filter((m) => m.sessionId === sessionId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  public static async countMessages(sessionId: string): Promise<number> {
    return (await this.getBySession(sessionId)).length;
  }
}
