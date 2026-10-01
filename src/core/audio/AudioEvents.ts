export type AudioEventType =
  | 'MIC_INITIALIZED'
  | 'MIC_STARTED'
  | 'MIC_STOPPED'
  | 'SPEECH_STARTED'
  | 'SPEECH_ENDED'
  | 'PLAYBACK_STARTED'
  | 'PLAYBACK_CHUNK_RECEIVED'
  | 'PLAYBACK_COMPLETED'
  | 'PLAYBACK_INTERRUPTED'
  | 'AUDIO_CONTEXT_SUSPENDED'
  | 'AUDIO_CONTEXT_RESUMED'
  | 'MIC_PERMISSION_DENIED'
  | 'AUDIO_ERROR';

export interface AudioEventPayload {
  type: AudioEventType;
  sessionId: string;
  timestamp: number;
  data?: Record<string, any>;
}

export type AudioEventListener = (event: AudioEventPayload) => void;
