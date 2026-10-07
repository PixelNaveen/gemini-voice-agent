import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext.tsx';

interface AudioWaveformCanvasProps {
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  accentColor?: string;
  sampleText?: string;
  audioUrl?: string;
}

export const AudioWaveformCanvas: React.FC<AudioWaveformCanvasProps> = ({
  isPlaying = true,
  onTogglePlay,
  accentColor,
  sampleText = "I've moved your appointment to next Thursday at 10:30 AM with Dr. Aris.",
  audioUrl,
}) => {
  const { palette } = useTheme();
  const resolvedAccentColor = accentColor || palette.emeraldAccent;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [internalPlaying, setInternalPlaying] = useState(isPlaying);
  const [isMuted, setIsMuted] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize and track audio element
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.preload = 'auto';
      audio.loop = false;
      audio.playbackRate = 1.08;
      audio.muted = isMuted;

      audio.onended = () => {
        setInternalPlaying(false);
        audio.currentTime = 0;
      };

      audioRef.current = audio;

      if (!isMuted && internalPlaying) {
        audio.play().catch(() => {});
      }

      return () => {
        audio.pause();
        audio.currentTime = 0;
        audio.onended = null;
        audioRef.current = null;
      };
    } else {
      // Fallback speech synthesis
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, [audioUrl]);

  useEffect(() => {
    setInternalPlaying(isPlaying);
  }, [isPlaying]);

  // Handle Play/Pause and Mute changes
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = 1.08;
      audio.muted = isMuted;
      if (!isMuted && internalPlaying) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (!isMuted && internalPlaying) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(sampleText);
        utterance.rate = 1.08;
        utterance.pitch = 1.0;
        utterance.onend = () => {
          setInternalPlaying(false);
        };
        const voices = window.speechSynthesis.getVoices();
        const naturalVoice = voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.includes('Natural') ||
              v.name.includes('Samantha') ||
              v.name.includes('Google') ||
              v.name.includes('Karen') ||
              v.name.includes('Jenny'))
        );
        if (naturalVoice) utterance.voice = naturalVoice;
        window.speechSynthesis.speak(utterance);
      } else {
        window.speechSynthesis.cancel();
      }
    }
  }, [isMuted, internalPlaying, sampleText]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    const audio = audioRef.current;
    if (audio) {
      audio.muted = nextMuted;
      if (!nextMuted && internalPlaying) {
        audio.play().catch(() => {});
      } else if (nextMuted) {
        audio.pause();
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let phase = 0;

    const barCount = 48;
    const heights = new Array(barCount).fill(0).map((_, i) => {
      const normalizedIdx = i / barCount;
      const centerDistance = Math.abs(normalizedIdx - 0.5) * 2;
      const envelope = Math.max(0.15, 1 - Math.pow(centerDistance, 1.4));
      return (
        (Math.sin(i * 0.28) * 0.4 + Math.sin(i * 0.4) * 0.3 + Math.cos(i * 0.6) * 0.3 + 1) *
          (140 * 0.42) *
          envelope +
        10
      );
    });

    const render = () => {
      animationId = requestAnimationFrame(render);
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Draw subtle grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      for (let y = 20; y < height; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const barWidth = (width / barCount) * 0.65;
      const barSpacing = (width / barCount) * 0.35;

      if (internalPlaying) {
        phase += 0.08;
      }

      for (let i = 0; i < barCount; i++) {
        const normalizedIdx = i / barCount;
        const centerDistance = Math.abs(normalizedIdx - 0.5) * 2;
        const envelope = Math.max(0.1, 1 - Math.pow(centerDistance, 1.4));

        if (internalPlaying) {
          // Multi-harmonic audio frequency simulation
          const targetHeight =
            (Math.sin(phase * 1.8 + i * 0.28) * 0.4 +
              Math.sin(phase * 3.2 - i * 0.4) * 0.3 +
              Math.cos(phase * 0.9 + i * 0.6) * 0.3 +
              1) *
              (height * 0.42) *
              envelope +
            8;

          // Smooth height transition
          heights[i] += (targetHeight - heights[i]) * 0.15;
        }

        const x = i * (barWidth + barSpacing) + barSpacing / 2;
        const yTop = (height - heights[i]) / 2;

        // Gradient bar
        const gradient = ctx.createLinearGradient(0, yTop, 0, yTop + heights[i]);
        if (internalPlaying) {
          gradient.addColorStop(0, '#34d399');
          gradient.addColorStop(0.5, resolvedAccentColor);
          gradient.addColorStop(1, '#064e3b');
        } else {
          gradient.addColorStop(0, '#10b981');
          gradient.addColorStop(0.5, 'rgba(5, 150, 105, 0.7)');
          gradient.addColorStop(1, '#064e3b');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, yTop, barWidth, heights[i], 3);
        ctx.fill();

        // High frequency glow cap
        if (heights[i] > height * 0.35) {
          ctx.fillStyle = internalPlaying ? '#6ee7b7' : 'rgba(110, 231, 183, 0.6)';
          ctx.beginPath();
          ctx.arc(x + barWidth / 2, yTop, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw subtle sine overlay wave
      ctx.beginPath();
      ctx.strokeStyle = internalPlaying ? 'rgba(52, 211, 153, 0.35)' : 'rgba(52, 211, 153, 0.18)';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < width; x += 3) {
        const nx = x / width;
        const wave = Math.sin(nx * 12 + phase * 2) * Math.cos(nx * 6 - phase) * 24;
        const y = height / 2 + wave;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [internalPlaying, accentColor]);

  const togglePlayback = () => {
    const nextPlaying = !internalPlaying;
    setInternalPlaying(nextPlaying);

    const audio = audioRef.current;
    if (audio) {
      if (!nextPlaying) {
        audio.pause();
      } else {
        if (!isMuted) {
          if (audio.ended || (audio.duration && audio.currentTime >= audio.duration - 0.2)) {
            audio.currentTime = 0;
          }
          audio.play().catch(() => {});
        }
      }
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (!nextPlaying) {
        window.speechSynthesis.cancel();
      } else {
        if (!isMuted) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(sampleText);
          utterance.rate = 1.08;
          utterance.pitch = 1.0;
          utterance.onend = () => {
            setInternalPlaying(false);
          };
          const voices = window.speechSynthesis.getVoices();
          const naturalVoice = voices.find(
            (v) =>
              v.lang.startsWith('en') &&
              (v.name.includes('Natural') ||
                v.name.includes('Samantha') ||
                v.name.includes('Google') ||
                v.name.includes('Karen') ||
                v.name.includes('Jenny'))
          );
          if (naturalVoice) utterance.voice = naturalVoice;
          window.speechSynthesis.speak(utterance);
        }
      }
    }

    if (onTogglePlay) onTogglePlay();
  };

  return (
    <div className="relative w-full rounded-2xl bg-[#0F0F11] border border-white/10 p-5 md:p-6 overflow-hidden text-white shadow-2xl">
      {/* Header with status at start and speaker/mute control at end */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              internalPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
            }`}
          />
          <span className="text-xs font-mono uppercase tracking-wider text-neutral-400">
            {internalPlaying ? 'Voice Stream Live' : 'Voice Standby'}
          </span>
        </div>

        <button
          onClick={toggleMute}
          className={`p-1 rounded-md transition-colors cursor-pointer ${
            isMuted
              ? 'text-neutral-500 hover:text-neutral-300'
              : 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
          }`}
          title={isMuted ? 'Unmute to hear voice' : 'Mute voice'}
          aria-label={isMuted ? 'Unmute to hear voice' : 'Mute voice'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Waveform Canvas */}
      <div className="relative py-4 my-2">
        <canvas
          ref={canvasRef}
          width={640}
          height={140}
          className="w-full h-32 md:h-36 block"
        />

        {/* Play/Pause hover trigger */}
        <button
          onClick={togglePlayback}
          className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-emerald-500 hover:border-emerald-400 transition-all duration-300 shadow-lg group"
          aria-label={internalPlaying ? "Pause audio" : "Play audio"}
        >
          {internalPlaying ? (
            <Pause className="w-5 h-5 fill-current text-white" />
          ) : (
            <Play className="w-5 h-5 fill-current text-white translate-x-0.5" />
          )}
        </button>
      </div>

      {/* Redesigned Transcript & Full Duplex stream container */}
      <div className="mt-4 pt-3.5 border-t border-white/10 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[10px] font-mono uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Full Duplex</span>
          </div>
          <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
            Autonomous Stream
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 backdrop-blur-xs">
          <p className="text-xs md:text-sm text-neutral-200 leading-relaxed font-sans italic">
            "{sampleText}"
          </p>
        </div>
      </div>
    </div>
  );
};
