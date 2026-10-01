import { AudioSessionContext, AudioChunk } from './AudioTypes';
import { MicrophoneManager } from './input/MicrophoneManager';
import { VADManager } from './input/VADManager';
import { PlaybackManager } from './output/PlaybackManager';
import { BargeInManager } from './interruption/BargeInManager';
import { AudioDiagnostics, AudioMetrics } from './diagnostics/AudioDiagnostics';
import { AudioEventListener, AudioEventPayload } from './AudioEvents';

export interface AudioManagerOptions {
  onAudioData: (base64Pcm: string) => void;
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  onBargeIn: (interruptedResponseId: string) => void;
  onPlaybackComplete: (responseId: string) => void;
}

export class AudioManager {
  private context: AudioSessionContext;
  private microphoneManager: MicrophoneManager;
  private vadManager: VADManager;
  private playbackManager: PlaybackManager;
  private bargeInManager: BargeInManager;
  private diagnostics: AudioDiagnostics;
  private listeners: AudioEventListener[] = [];
  private isShuttingDown = false;

  constructor(context: AudioSessionContext, options: AudioManagerOptions) {
    this.context = context;
    this.diagnostics = new AudioDiagnostics(context.sessionId, context.connectionId, context.personaId);

    this.playbackManager = new PlaybackManager({
      onStatusChange: (status) => {
        this.diagnostics.setStatuses(this.microphoneManager?.getStatus() || 'UNINITIALIZED', status);
      },
      onPlaybackStart: (responseId) => {
        this.diagnostics.recordResponseStart(responseId);
        this.diagnostics.recordFirstAudioPlayback();
        this.emitEvent('PLAYBACK_STARTED', { responseId });
      },
      onPlaybackComplete: (responseId) => {
        this.emitEvent('PLAYBACK_COMPLETED', { responseId });
        options.onPlaybackComplete(responseId);
      },
      onInterrupted: (responseId) => {
        this.diagnostics.recordInterruption();
        this.emitEvent('PLAYBACK_INTERRUPTED', { responseId });
      },
    });

    this.bargeInManager = new BargeInManager(this.playbackManager, {
      onBargeIn: (respId) => {
        options.onBargeIn(respId);
      },
    });

    this.vadManager = new VADManager({
      onSpeechStart: () => {
        this.bargeInManager.handleSpeechStarted();
        this.emitEvent('SPEECH_STARTED');
        options.onSpeechStart();
      },
      onSpeechEnd: () => {
        this.diagnostics.recordSpeechEnd();
        this.emitEvent('SPEECH_ENDED');
        options.onSpeechEnd();
      },
      onEnergyUpdate: (energy, noiseFloor, isSpeaking) => {
        this.diagnostics.updateEnergy(energy, noiseFloor, isSpeaking);
      },
    });

    this.microphoneManager = new MicrophoneManager({
      onAudioData: (base64, rawPcm) => {
        if (this.isShuttingDown) return;
        this.vadManager.processAudioFrame(rawPcm);
        options.onAudioData(base64);
      },
      onStatusChange: (status) => {
        this.diagnostics.setStatuses(status, this.playbackManager.getStatus());
        if (status === 'LISTENING') this.emitEvent('MIC_STARTED');
        if (status === 'READY') this.emitEvent('MIC_INITIALIZED');
        if (status === 'PERMISSION_DENIED') this.emitEvent('MIC_PERMISSION_DENIED');
      },
      onError: (err) => {
        this.diagnostics.recordError();
        this.emitEvent('AUDIO_ERROR', { error: err.message });
      },
    });
  }

  public async initialize(): Promise<boolean> {
    const micOk = await this.microphoneManager.initialize();
    await this.playbackManager.initialize();
    return micOk;
  }

  public startListening(): void {
    this.microphoneManager.start();
  }

  public pauseListening(): void {
    this.microphoneManager.pause();
  }

  public mute(muted: boolean): void {
    this.microphoneManager.mute(muted);
  }

  public enqueuePlayback(chunk: AudioChunk): void {
    if (this.isShuttingDown) return;
    this.playbackManager.enqueueAudioChunk(chunk);
    this.diagnostics.updateQueueLength(1);
  }

  public interrupt(responseId?: string): void {
    this.playbackManager.interrupt(responseId);
  }

  public getDiagnostics(): AudioMetrics {
    return this.diagnostics.getSnapshot();
  }

  public subscribe(listener: AudioEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emitEvent(type: AudioEventPayload['type'], data?: Record<string, any>): void {
    const payload: AudioEventPayload = {
      type,
      sessionId: this.context.sessionId,
      timestamp: Date.now(),
      data,
    };
    for (const l of this.listeners) {
      try {
        l(payload);
      } catch (e) {
        console.error('[AudioManager] Listener error:', e);
      }
    }
  }

  /**
   * Hard teardown of all microphone streams, audio contexts, queues, and nodes.
   */
  public shutdown(): void {
    this.isShuttingDown = true;
    this.microphoneManager.stop();
    this.playbackManager.stop();
    this.vadManager.reset();
    this.listeners = [];
    console.log(`[AudioManager] Shutdown complete for session: ${this.context.sessionId}`);
  }
}
