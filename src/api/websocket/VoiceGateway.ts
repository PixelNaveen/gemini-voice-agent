import { MessageEnvelope, ClientAudioChunkPayload, ServerAssistantAudioPayload } from './MessageSchemas';

export class VoiceGateway {
  private static sequenceTracker: Map<string, number> = new Map();

  public static createServerEnvelope<T>(
    type: MessageEnvelope<T>['type'],
    sessionId: string,
    connectionId: string,
    payload: T
  ): MessageEnvelope<T> {
    const key = `${sessionId}_${connectionId}`;
    const seq = (this.sequenceTracker.get(key) || 0) + 1;
    this.sequenceTracker.set(key, seq);

    return {
      type,
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sessionId,
      connectionId,
      sequence: seq,
      timestamp: Date.now(),
      payload,
    };
  }

  public static clearSession(sessionId: string): void {
    for (const key of this.sequenceTracker.keys()) {
      if (key.startsWith(sessionId)) {
        this.sequenceTracker.delete(key);
      }
    }
  }
}
