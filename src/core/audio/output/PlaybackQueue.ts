import { AudioChunk } from '../AudioTypes';

export class PlaybackQueue {
  private queue: AudioChunk[] = [];
  private activeResponseId: string | null = null;

  public enqueue(chunk: AudioChunk): void {
    // Drop chunks from stale responses
    if (this.activeResponseId && chunk.responseId !== this.activeResponseId) {
      return;
    }
    this.queue.push(chunk);
  }

  public dequeue(): AudioChunk | undefined {
    return this.queue.shift();
  }

  public setActiveResponseId(responseId: string | null): void {
    this.activeResponseId = responseId;
  }

  public getActiveResponseId(): string | null {
    return this.activeResponseId;
  }

  public clear(): void {
    this.queue = [];
  }

  public length(): number {
    return this.queue.length;
  }

  public isEmpty(): boolean {
    return this.queue.length === 0;
  }
}
