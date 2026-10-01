export type ClientMessageType =
  | 'CLIENT_SESSION_START'
  | 'CLIENT_AUDIO_CHUNK'
  | 'CLIENT_INTERRUPT'
  | 'CLIENT_SESSION_END';

export type ServerMessageType =
  | 'SERVER_SESSION_STARTED'
  | 'SERVER_ASSISTANT_AUDIO'
  | 'SERVER_TRANSCRIPT'
  | 'SERVER_TOOL_EVENT'
  | 'SERVER_ERROR'
  | 'SERVER_SESSION_ENDED';

export interface MessageEnvelope<T> {
  type: ClientMessageType | ServerMessageType;
  messageId: string;
  sessionId: string;
  connectionId: string;
  sequence: number;
  timestamp: number;
  payload: T;
}

export interface ClientSessionStartPayload {
  tenantId: string;
  personaId: string;
  voice?: string;
}

export interface ClientAudioChunkPayload {
  pcmBase64: string;
  sampleRate: number;
}

export interface ServerAssistantAudioPayload {
  pcmBase64: string;
  sampleRate: number;
  isFinalChunk?: boolean;
}

export interface ServerTranscriptPayload {
  speaker: 'user' | 'agent';
  text: string;
  isFinal: boolean;
}

export interface ServerToolEventPayload {
  toolName: string;
  status: 'STARTED' | 'COMPLETED' | 'FAILED';
  summary?: string;
}
