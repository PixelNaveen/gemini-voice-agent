export type AudioInputStatus =
  | 'UNINITIALIZED'
  | 'REQUESTING_PERMISSION'
  | 'READY'
  | 'LISTENING'
  | 'SPEECH_DETECTED'
  | 'MUTED'
  | 'PERMISSION_DENIED'
  | 'ERROR';

export type AudioOutputStatus =
  | 'IDLE'
  | 'BUFFERING'
  | 'PLAYING'
  | 'INTERRUPTED'
  | 'STOPPED';

export interface AudioChunk {
  sessionId: string;
  connectionId: string;
  responseId: string;
  sequence: number;
  data: Float32Array;
  sampleRate: number;
  timestamp: number;
}

export interface AudioSessionContext {
  sessionId: string;
  connectionId: string;
  personaId: string;
  generation: number;
}
