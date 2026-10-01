export interface AudioMetrics {
  sessionId: string;
  connectionId: string;
  personaId: string;
  inputStatus: string;
  outputStatus: string;
  sampleRate: number;
  noiseFloor: number;
  currentEnergy: number;
  isSpeaking: boolean;
  activeResponseId: string | null;
  queuedChunks: number;
  interruptionCount: number;
  errorCount: number;
  lastTtfaMs: number | null;
  lastTurnLatencyMs: number | null;
}

export class AudioDiagnostics {
  private metrics: AudioMetrics;
  private speechEndTimestamp: number | null = null;
  private responseStartTimestamp: number | null = null;

  constructor(sessionId: string, connectionId: string, personaId: string, sampleRate = 24000) {
    this.metrics = {
      sessionId,
      connectionId,
      personaId,
      inputStatus: 'UNINITIALIZED',
      outputStatus: 'IDLE',
      sampleRate,
      noiseFloor: 0.01,
      currentEnergy: 0.0,
      isSpeaking: false,
      activeResponseId: null,
      queuedChunks: 0,
      interruptionCount: 0,
      errorCount: 0,
      lastTtfaMs: null,
      lastTurnLatencyMs: null,
    };
  }

  public recordSpeechEnd(): void {
    this.speechEndTimestamp = Date.now();
  }

  public recordResponseStart(responseId: string): void {
    this.responseStartTimestamp = Date.now();
    this.metrics.activeResponseId = responseId;
    if (this.speechEndTimestamp) {
      this.metrics.lastTurnLatencyMs = this.responseStartTimestamp - this.speechEndTimestamp;
    }
  }

  public recordFirstAudioPlayback(): void {
    if (this.responseStartTimestamp) {
      this.metrics.lastTtfaMs = Date.now() - this.responseStartTimestamp;
    }
  }

  public recordInterruption(): void {
    this.metrics.interruptionCount++;
    this.metrics.outputStatus = 'INTERRUPTED';
  }

  public recordError(): void {
    this.metrics.errorCount++;
  }

  public updateEnergy(energy: number, noiseFloor: number, isSpeaking: boolean): void {
    this.metrics.currentEnergy = energy;
    this.metrics.noiseFloor = noiseFloor;
    this.metrics.isSpeaking = isSpeaking;
  }

  public updateQueueLength(len: number): void {
    this.metrics.queuedChunks = len;
  }

  public setStatuses(input: string, output: string): void {
    this.metrics.inputStatus = input;
    this.metrics.outputStatus = output;
  }

  public getSnapshot(): AudioMetrics {
    return { ...this.metrics };
  }
}
