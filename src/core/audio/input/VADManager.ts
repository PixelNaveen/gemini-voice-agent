export interface VADCallbacks {
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  onEnergyUpdate?: (energy: number, noiseFloor: number, isSpeaking: boolean) => void;
}

export class VADManager {
  private noiseFloor = 0.01;
  private speechStartThreshold = 0.035;
  private speechEndThreshold = 0.015;
  private isSpeaking = false;
  private speechConfirmationFrames = 0;
  private minConfirmationFrames = 2;
  private silenceDurationMs = 0;
  private minSilenceForEndMs = 600; // 600ms pause needed to declare end of turn
  private lastProcessTimestamp = Date.now();
  private callbacks: VADCallbacks;

  constructor(callbacks: VADCallbacks) {
    this.callbacks = callbacks;
  }

  public processAudioFrame(channelData: Float32Array): void {
    const now = Date.now();
    const dt = now - this.lastProcessTimestamp;
    this.lastProcessTimestamp = now;

    // Calculate RMS energy
    let sum = 0;
    for (let i = 0; i < channelData.length; i++) {
      sum += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sum / channelData.length);

    // Dynamic noise floor tracking (slow moving average)
    if (!this.isSpeaking && rms < this.speechStartThreshold) {
      this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05;
    }

    const effectiveStartThreshold = Math.max(this.speechStartThreshold, this.noiseFloor * 2.5);
    const effectiveEndThreshold = Math.max(this.speechEndThreshold, this.noiseFloor * 1.5);

    if (rms > effectiveStartThreshold) {
      this.silenceDurationMs = 0;
      this.speechConfirmationFrames++;

      if (!this.isSpeaking && this.speechConfirmationFrames >= this.minConfirmationFrames) {
        this.isSpeaking = true;
        this.callbacks.onSpeechStart();
      }
    } else if (rms < effectiveEndThreshold) {
      this.speechConfirmationFrames = 0;
      if (this.isSpeaking) {
        this.silenceDurationMs += dt;
        if (this.silenceDurationMs >= this.minSilenceForEndMs) {
          this.isSpeaking = false;
          this.silenceDurationMs = 0;
          this.callbacks.onSpeechEnd();
        }
      }
    }

    if (this.callbacks.onEnergyUpdate) {
      this.callbacks.onEnergyUpdate(rms, this.noiseFloor, this.isSpeaking);
    }
  }

  public reset(): void {
    this.isSpeaking = false;
    this.speechConfirmationFrames = 0;
    this.silenceDurationMs = 0;
  }
}
