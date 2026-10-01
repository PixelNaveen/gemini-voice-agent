import { AudioInputStatus } from '../AudioTypes';

export interface MicrophoneCallbacks {
  onAudioData: (base64Pcm: string, rawPcm: Float32Array) => void;
  onStatusChange: (status: AudioInputStatus) => void;
  onError: (err: Error) => void;
}

export class MicrophoneManager {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private status: AudioInputStatus = 'UNINITIALIZED';
  private callbacks: MicrophoneCallbacks;
  private isMuted = false;

  constructor(callbacks: MicrophoneCallbacks) {
    this.callbacks = callbacks;
  }

  public getStatus(): AudioInputStatus {
    return this.status;
  }

  public async initialize(): Promise<boolean> {
    this.setStatus('REQUESTING_PERMISSION');
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 16000 });

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processorNode = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.processorNode.onaudioprocess = (e) => {
        if (this.isMuted || this.status !== 'LISTENING') return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = this.floatTo16BitPCM(inputData);
        const base64 = this.arrayBufferToBase64(pcm16.buffer);

        this.callbacks.onAudioData(base64, inputData);
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.setStatus('READY');
      return true;
    } catch (err: any) {
      console.error('[MicrophoneManager] Permission or initialization error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.setStatus('PERMISSION_DENIED');
      } else {
        this.setStatus('ERROR');
      }
      this.callbacks.onError(err);
      return false;
    }
  }

  public start(): void {
    if (this.status === 'READY' || this.status === 'MUTED') {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      this.setStatus('LISTENING');
    }
  }

  public pause(): void {
    if (this.status === 'LISTENING') {
      this.setStatus('READY');
    }
  }

  public mute(muted: boolean): void {
    this.isMuted = muted;
    this.setStatus(muted ? 'MUTED' : 'LISTENING');
  }

  public stop(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.setStatus('UNINITIALIZED');
  }

  private setStatus(status: AudioInputStatus): void {
    this.status = status;
    this.callbacks.onStatusChange(status);
  }

  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  private arrayBufferToBase64(buffer: ArrayBufferLike): string {
    let binary = '';
    const bytes = new Uint8Array(buffer as ArrayBuffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
