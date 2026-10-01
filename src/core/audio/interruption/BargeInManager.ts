import { PlaybackManager } from '../output/PlaybackManager';

export interface BargeInCallbacks {
  onBargeIn: (interruptedResponseId: string) => void;
}

export class BargeInManager {
  private playbackManager: PlaybackManager;
  private callbacks: BargeInCallbacks;

  constructor(playbackManager: PlaybackManager, callbacks: BargeInCallbacks) {
    this.playbackManager = playbackManager;
    this.callbacks = callbacks;
  }

  /**
   * Called whenever VAD detects the start of caller speech.
   */
  public handleSpeechStarted(): boolean {
    const outputStatus = this.playbackManager.getStatus();
    const activeResponseId = this.playbackManager.getCurrentResponseId();

    if (outputStatus === 'PLAYING' || outputStatus === 'BUFFERING') {
      console.log(`[BargeInManager] Caller speech detected while AURA is speaking. Triggering barge-in for response: ${activeResponseId}`);
      this.playbackManager.interrupt();
      if (activeResponseId) {
        this.callbacks.onBargeIn(activeResponseId);
      }
      return true;
    }

    return false;
  }
}
