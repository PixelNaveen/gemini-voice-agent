import { AudioChunk, AudioOutputStatus } from '../AudioTypes';
import { PlaybackQueue } from './PlaybackQueue';

export interface PlaybackCallbacks {
  onStatusChange: (status: AudioOutputStatus) => void;
  onPlaybackStart: (responseId: string) => void;
  onPlaybackComplete: (responseId: string) => void;
  onInterrupted: (responseId: string) => void;
}

export class PlaybackManager {
  private audioContext: AudioContext | null = null;
  private queue = new PlaybackQueue();
  private status: AudioOutputStatus = 'IDLE';
  private isPlaying = false;
  private nextPlayTime = 0;
  private activeSourceNodes: AudioBufferSourceNode[] = [];
  private callbacks: PlaybackCallbacks;
  private currentResponseId: string | null = null;

  constructor(callbacks: PlaybackCallbacks) {
    this.callbacks = callbacks;
  }

  public async initialize(): Promise<void> {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 24000 });
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    this.setStatus('IDLE');
  }

  public getStatus(): AudioOutputStatus {
    return this.status;
  }

  public getCurrentResponseId(): string | null {
    return this.currentResponseId;
  }

  /**
   * Enqueues incoming PCM chunk and begins smooth scheduled playback.
   */
  public enqueueAudioChunk(chunk: AudioChunk): void {
    if (this.currentResponseId !== chunk.responseId) {
      this.currentResponseId = chunk.responseId;
      this.queue.setActiveResponseId(chunk.responseId);
      this.callbacks.onPlaybackStart(chunk.responseId);
    }

    this.queue.enqueue(chunk);
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (!this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    while (!this.queue.isEmpty()) {
      const chunk = this.queue.dequeue();
      if (!chunk) break;

      const audioBuffer = this.audioContext.createBuffer(1, chunk.data.length, chunk.sampleRate);
      audioBuffer.getChannelData(0).set(chunk.data);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      const currentTime = this.audioContext.currentTime;
      const lookahead = this.nextPlayTime > currentTime ? 0.005 : 0.012;
      const startTime = Math.max(currentTime + lookahead, this.nextPlayTime);
      source.start(startTime);

      this.nextPlayTime = startTime + audioBuffer.duration;
      this.activeSourceNodes.push(source);
      this.setStatus('PLAYING');
      this.isPlaying = true;

      source.onended = () => {
        const idx = this.activeSourceNodes.indexOf(source);
        if (idx !== -1) this.activeSourceNodes.splice(idx, 1);

        if (this.activeSourceNodes.length === 0 && this.queue.isEmpty()) {
          this.isPlaying = false;
          this.setStatus('IDLE');
          if (this.currentResponseId) {
            this.callbacks.onPlaybackComplete(this.currentResponseId);
          }
        }
      };
    }
  }

  /**
   * Immediate barge-in interruption: stops active audio nodes and purges queue.
   */
  public interrupt(responseId?: string): void {
    const targetId = responseId || this.currentResponseId;
    console.log(`[PlaybackManager] Interrupting response: ${targetId}`);

    for (const source of this.activeSourceNodes) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Source might already have ended
      }
    }
    this.activeSourceNodes = [];
    this.queue.clear();
    this.nextPlayTime = 0;
    this.isPlaying = false;
    this.setStatus('INTERRUPTED');

    if (targetId) {
      this.callbacks.onInterrupted(targetId);
    }
    this.setStatus('IDLE');
  }

  public stop(): void {
    this.interrupt();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.setStatus('STOPPED');
  }

  private setStatus(status: AudioOutputStatus): void {
    this.status = status;
    this.callbacks.onStatusChange(status);
  }
}
