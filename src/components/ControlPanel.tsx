import React, { useState } from 'react';
import { AgentStatus, IndustryPreset } from '../types';
import { Mic, MicOff, Square, Sparkles, PhoneCall, PhoneOff, MessageSquareText, Send, AlertTriangle, RefreshCw, Building2, Timer, ChevronRight, Lock } from 'lucide-react';

interface ControlPanelProps {
  status: AgentStatus;
  isMicMuted: boolean;
  micError?: string | null;
  apiError?: string | null;
  remainingSeconds: number;
  currentPreset: IndustryPreset;
  onOpenIndustryModal: () => void;
  onRetryMic?: () => void;
  onToggleMic: () => void;
  onStartSession: () => void;
  onEndSession: () => void;
  onInterruptAgent: () => void;
  onSendPresetPrompt: (promptText: string) => void;
  isPersonaLocked?: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  status,
  isMicMuted,
  micError,
  apiError,
  remainingSeconds,
  currentPreset,
  onOpenIndustryModal,
  onRetryMic,
  onToggleMic,
  onStartSession,
  onEndSession,
  onInterruptAgent,
  onSendPresetPrompt,
  isPersonaLocked = false,
}) => {
  const [customInput, setCustomInput] = useState('');
  const isActive = status !== 'idle' && status !== 'error';

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    onSendPresetPrompt(customInput);
    setCustomInput('');
  };

  return (
    <div className="w-full max-w-2xl mx-auto z-10 flex flex-col items-center gap-3 my-2 px-4">
      {/* Industry Persona Bar & 5-Minute Timer Pill */}
      <div className="w-full flex items-center justify-between gap-2 bg-stone-950/80 border border-stone-800 p-2.5 rounded-2xl shadow-lg backdrop-blur-md">
        <button
          onClick={onOpenIndustryModal}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-900 border border-amber-500/25 hover:border-amber-500/50 text-xs text-amber-200 transition-all cursor-pointer group"
        >
          {isPersonaLocked ? (
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span className="font-semibold text-stone-100 group-hover:text-amber-300 transition-colors">
            {currentPreset.businessName}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-medium border border-amber-500/20 flex items-center gap-1">
            {isPersonaLocked ? 'Locked Niche' : 'Switch Niche'}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-stone-500 group-hover:text-amber-300 transition-colors" />
        </button>

        {isActive ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 border border-amber-500/30 font-mono text-xs text-amber-300 shadow-md">
            <Timer className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="font-bold">{formatTime(remainingSeconds)}</span>
            <span className="text-[10px] text-stone-500 uppercase font-sans">Left</span>
          </div>
        ) : (
          <span className="text-[11px] text-stone-400 font-medium px-2.5 py-1 rounded-lg bg-stone-900 border border-stone-800">
            ⏱️ 5-Min Demo Session
          </span>
        )}
      </div>

      {/* Mic Permission Warning Banner */}
      {micError && (
        <div className="w-full p-3.5 rounded-2xl bg-amber-950/80 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-3 shadow-lg backdrop-blur-md animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{micError}</span>
          </div>
          {onRetryMic && (
            <button
              onClick={onRetryMic}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shrink-0 transition-colors shadow-md"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Mic</span>
            </button>
          )}
        </div>
      )}

      {/* API Key / Quota Warning Banner */}
      {apiError && (
        <div className="w-full p-3.5 rounded-2xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-center justify-between gap-3 shadow-lg backdrop-blur-md animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{apiError}</span>
          </div>
          <button
            onClick={() => onStartSession()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-400 text-stone-950 font-bold text-xs shrink-0 transition-colors shadow-md cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Key Node</span>
          </button>
        </div>
      )}

      {/* Preset Quick Actions for Selected Industry */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {currentPreset.sampleQueries.map((query, i) => (
          <button
            key={i}
            onClick={() => onSendPresetPrompt(query)}
            disabled={!isActive}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900/80 border border-amber-500/15 hover:border-amber-500/40 text-xs text-stone-300 hover:text-amber-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-black/40"
          >
            <MessageSquareText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate max-w-[200px]">{query}</span>
          </button>
        ))}
      </div>

      {/* Custom Text Input Form for Direct Communication */}
      <form onSubmit={handleCustomSubmit} className="w-full flex items-center gap-2">
        <input
          type="text"
          placeholder={isActive ? `Type a question to ${currentPreset.businessName}...` : "Tap 'Start Call' to test agent..."}
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          disabled={!isActive}
          className="flex-1 px-4 py-2.5 bg-stone-950/90 border border-amber-500/25 rounded-2xl text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500/60 transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!isActive || !customInput.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-bold text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:cursor-not-allowed"
        >
          <span>Send</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* Primary ElevenLabs Control Hub */}
      <div className="flex items-center justify-center gap-4 bg-stone-950/90 border border-amber-500/20 p-3 sm:p-4 rounded-3xl backdrop-blur-2xl shadow-2xl shadow-black/90">
        {/* Mic Toggle Button */}
        <button
          onClick={onToggleMic}
          disabled={!isActive}
          title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
            isMicMuted
              ? 'bg-red-500/20 text-red-400 border-red-500/40 shadow-lg shadow-red-500/10'
              : 'bg-stone-900 text-amber-300 border-stone-800 hover:border-amber-500/40'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Dynamic Central "TAP TO START" / "END CONVERSATION" Button */}
        {!isActive ? (
          <button
            onClick={onOpenIndustryModal}
            className="relative group overflow-hidden flex items-center gap-3 px-8 py-4 sm:px-10 sm:py-4.5 rounded-2xl font-bold tracking-wider uppercase text-sm sm:text-base text-stone-950 bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500 shadow-[0_0_35px_rgba(234,179,8,0.45)] hover:shadow-[0_0_50px_rgba(234,179,8,0.7)] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            <PhoneCall className="w-5 h-5 fill-stone-950" />
            <span>Start Test Call</span>
            <Sparkles className="w-4 h-4 text-stone-950 animate-spin" style={{ animationDuration: '4s' }} />
          </button>
        ) : (
          <button
            onClick={onEndSession}
            className="flex items-center gap-3 px-8 py-4 sm:px-10 sm:py-4.5 rounded-2xl font-bold tracking-wider uppercase text-sm sm:text-base text-stone-100 bg-red-600/90 hover:bg-red-600 border border-red-500/50 shadow-[0_0_30px_rgba(220,38,38,0.4)] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <PhoneOff className="w-5 h-5" />
            <span>End Call</span>
          </button>
        )}

        {/* Interrupt / Stop Agent Button */}
        <button
          onClick={onInterruptAgent}
          disabled={status !== 'speaking'}
          title="Interrupt Agent / Stop Speaking"
          className="p-3.5 sm:p-4 rounded-2xl bg-stone-900 text-stone-300 hover:text-amber-200 border border-stone-800 hover:border-amber-500/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Square className="w-5 h-5 fill-current text-amber-400/80" />
        </button>
      </div>
    </div>
  );
};
