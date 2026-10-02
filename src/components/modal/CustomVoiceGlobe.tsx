import React from 'react';
import { AgentStatus } from '../../types';

interface CustomVoiceGlobeProps {
  status: AgentStatus;
  audioLevel: number;
  isAgentSpeaking: boolean;
  isListening: boolean;
  isMicMuted?: boolean;
}

export const CustomVoiceGlobe: React.FC<CustomVoiceGlobeProps> = ({
  status,
  audioLevel,
  isAgentSpeaking,
  isListening,
  isMicMuted,
}) => {
  // Compute dynamic scale based on audio volume
  const scale = isAgentSpeaking
    ? 1 + Math.min(0.35, audioLevel * 0.9)
    : isListening
      ? 1 + Math.min(0.2, audioLevel * 0.5)
      : 1;

  const glowColor = isAgentSpeaking
    ? 'rgba(16, 185, 129, 0.45)' // Emerald glow when speaking
    : isListening
      ? 'rgba(59, 130, 246, 0.45)' // Blue glow when listening
      : 'rgba(245, 158, 11, 0.35)'; // Amber gold when idle/connecting

  return (
    <div className="container-vao py-4 flex flex-col items-center justify-center relative select-none">
      {/* Dynamic Background Aura Glow */}
      <div
        className="absolute w-44 h-44 rounded-full blur-3xl transition-all duration-300 pointer-events-none -z-10"
        style={{
          backgroundColor: glowColor,
          transform: `scale(${scale * 1.3})`,
        }}
      />

      {/* Main Interactive Orb Body */}
      <div
        className="relative w-28 h-28 flex items-center justify-center transition-transform duration-100 ease-out"
        style={{ transform: `scale(${scale})` }}
      >
        {/* Animated Lines Waveform Mask */}
        <div className="container-lines-globe" />

        {/* 3D Orbiting Gyroscopic Rings */}
        <div className="container-rings-globe" />

        {/* Central Core Ball */}
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-colors duration-500 ${
            isAgentSpeaking
              ? 'bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-300 shadow-emerald-500/50'
              : isListening
                ? 'bg-gradient-to-tr from-blue-600 via-indigo-500 to-cyan-400 shadow-blue-500/50'
                : 'bg-gradient-to-tr from-amber-600 via-yellow-500 to-amber-300 shadow-amber-500/50'
          }`}
        >
          {/* Inner Central Sound Wave Icon */}
          <div className="flex items-center gap-1">
            {[40, 75, 100, 60, 30].map((heightPct, idx) => {
              const dynamicHeight = isAgentSpeaking || isListening
                ? Math.max(10, heightPct * (0.4 + audioLevel * 1.5))
                : heightPct * 0.35;
              return (
                <div
                  key={idx}
                  className="w-1 rounded-full bg-white transition-all duration-75"
                  style={{ height: `${Math.min(32, dynamicHeight)}px` }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* State Caption Indicator */}
      <div className="mt-4 flex items-center gap-2 px-3 py-1 rounded-full bg-stone-900/80 border border-stone-800 backdrop-blur-md shadow-sm">
        <span
          className={`w-2 h-2 rounded-full ${
            isAgentSpeaking
              ? 'bg-emerald-400 animate-pulse'
              : isListening
                ? 'bg-blue-400 animate-pulse'
                : status === 'connecting'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-stone-500'
          }`}
        />
        <span className="text-xs font-mono font-medium text-stone-200 uppercase tracking-wider">
          {isAgentSpeaking
            ? 'Aura is speaking...'
            : isListening
              ? 'Listening to you...'
              : isMicMuted
                ? 'Microphone muted'
                : status === 'connecting'
                  ? 'Connecting to Gemini Live...'
                  : 'Call Active'}
        </span>
      </div>
    </div>
  );
};
