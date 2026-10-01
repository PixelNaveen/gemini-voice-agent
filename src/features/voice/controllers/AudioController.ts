import { SessionStore } from '../../../state/session/SessionStore';

export class AudioController {
  private static inputContext: AudioContext | null = null;
  private static outputContext: AudioContext | null = null;
  private static mediaStream: MediaStream | null = null;
  private static isMuted = false;
  private static playbackQueue: AudioBuffer[] = [];
  private static isPlaying = false;

  public static async initMicrophone(): Promise<MediaStream> {
    if (this.mediaStream) return this.mediaStream;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    return this.mediaStream;
  }

  public static interruptPlayback(): void {
    this.playbackQueue = [];
    this.isPlaying = false;
    SessionStore.setState({ isAgentSpeaking: false });
  }

  public static setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  public static cleanup(): void {
    this.interruptPlayback();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.inputContext && this.inputContext.state !== 'closed') {
      this.inputContext.close();
      this.inputContext = null;
    }
    if (this.outputContext && this.outputContext.state !== 'closed') {
      this.outputContext.close();
      this.outputContext = null;
    }
  }
}
