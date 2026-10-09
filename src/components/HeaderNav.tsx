import React from 'react';
import { Settings, Volume2, VolumeX, Maximize2, Brain, Radio, Sparkles, Zap, Gauge } from 'lucide-react';
import { VoiceOption, AVAILABLE_VOICES } from '../types';

interface HeaderNavProps {
  selectedVoice: VoiceOption;
  onSelectVoice: (voice: VoiceOption) => void;
  speechSpeedRate: number;
  onChangeSpeedRate: (speed: number) => void;
  onOpenSettings: () => void;
  onOpenMemory: () => void;
  memoryCount: number;
  isAudioMuted: boolean;
  onToggleAudioMute: () => void;
  isConnected: boolean;
}

const SPEED_CYCLE = [1.0, 1.2, 1.35];

export const HeaderNav: React.FC<HeaderNavProps> = ({
  selectedVoice,
  onSelectVoice,
  speechSpeedRate,
  onChangeSpeedRate,
  onOpenSettings,
  onOpenMemory,
  memoryCount,
  isAudioMuted,
  onToggleAudioMute,
  isConnected,
}) => {
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen() .catch(() => {});
    }
  };

const cycleSpeed = () => {
    const next = (SPEED_CYCLE.indexOf(speechSpeedRate) + 1) % SPEED_CYCLE.length;
    onChangeSpeedRate(SPEED_CYCLE[next]);
  };

  return (
    <header className="relative z-20 w-full flex items-center justify-between px-4 sm:px-8 py-4 border-b border-amber-500/15 bg-black/80 backdrop-blur-md">
      {/* Zone 1: Brand Title Wordmark */}
      <div className="flex items-center gap-3">
        <a href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-200 p-0.5 shadow-lg shadow-amber-500/20 group-hover:shadow-amber-500/40 transition-shadow">
            <div className="w-full h-full bg-stone-950 rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
          </div>
          <span className="font-['Cinzel'] text-xl font-bold tracking-[0.2em] bg-gradient-to-r from-amber-100 via-amber-300 to-amber-500 bg-clip-text text-transparent">
            AURA
          </span>
        </a>
      </div>

      {/* Zone 2: Navigation Status & Voice Badge */}
      <div className="hidden md:flex items-center gap-3">
        {/* Model Pill */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-stone-900/90 border border-amber-500/20 text-xs font-mono font-medium text-amber-200">
          <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>GEMINI 3.8 LIVE</span>
        </div>

        {/* Voice Dropdown */}
        <div className="relative flex items-center">
          <select
            value={selectedVoice.id}
            onChange={(e) => {
              const v = AVAILABLE_VOICES.find((item) => item.id === e.target.value);
              if (v) onSelectVoice(v);
            }}
            className="appearance-none bg-stone-900 border border-amber-500/20 hover:border-amber-500/40 text-xs text-amber-100 font-medium py-1 pl-3 pr-8 rounded-full focus:outline-none cursor-pointer transition-colors"
          >
            {AVAILABLE_VOICES.map((v) => (
              <option key={v.id} value={v.id} className="bg-stone-900 text-stone-100">
                {v.name} ({v.gender} • {v.speed})
              </option>
            ))}
          </select>
          <div className="absolute right-2.5 pointer-events-none text-amber-400 text-[10px]">
            ▼
          </div>
        </div>

        {/* Live Indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-mono text-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{isConnected ? 'ONLINE' : 'STANDBY'}</span>
        </div>
      </div>

      {/* Zone 3: Actions */}
      <div className="flex items-center gap-2">
        {/* Low API Latency Mode Badge */}
        <div
          title="Gemini 3.8 Live API Ultra-Low Latency Mode Active"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shadow-md shadow-emerald-500/5"
        >
          <Zap className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
          <span>MIN LATENCY</span>
        </div>

        {/* Session Memory Inspector Button */}
        <button
          onClick={onOpenMemory}
          title="Session Memory Inspector"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold text-amber-300 hover:text-amber-100 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-all shadow-md shadow-amber-500/5 cursor-pointer"
        >
          <Brain className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline">MEMORY</span>
          <span className="px-1.5 py-0.2 rounded-full bg-amber-500/30 text-[10px] text-amber-200">
            {memoryCount}
          </span>
        </button>

        <button
          onClick={cycleSpeed}
          title="Cycle Speech Speed (pitch preserved)"
          aria-label={`Speech speed ${speechSpeedRate.toFixed(2)}x, click to cycle`}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold text-amber-300 hover:text-amber-100 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-all shadow-md shadow-amber-500/5 cursor-pointer"
        >
          <Gauge className="w-4 h-4 text-amber-400" />
          <span>{speechSpeedRate.toFixed(2)}&times;</span>
        </button>

        <button
          onClick={onToggleAudioMute}
          title={isAudioMuted ? 'Unmute Speaker Output' : 'Mute Speaker Output'}
          className="p-2 text-stone-300 hover:text-amber-200 bg-stone-900/80 hover:bg-stone-800 border border-stone-800 hover:border-amber-500/30 rounded-xl transition-all cursor-pointer"
        >
          {isAudioMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-300" />}
        </button>

        <button
          onClick={onOpenSettings}
          title="Agent Configuration"
          className="p-2 text-stone-300 hover:text-amber-200 bg-stone-900/80 hover:bg-stone-800 border border-stone-800 hover:border-amber-500/30 rounded-xl transition-all cursor-pointer"
        >
          <Settings className="w-4 h-4 text-amber-300" />
        </button>

        <button
          onClick={toggleFullscreen}
          title="Toggle Fullscreen"
          className="p-2 text-stone-300 hover:text-amber-200 bg-stone-900/80 hover:bg-stone-800 border border-stone-800 hover:border-amber-500/30 rounded-xl transition-all hidden sm:block cursor-pointer"
        >
          <Maximize2 className="w-4 h-4 text-stone-400" />
        </button>
      </div>
    </header>
  );
};
