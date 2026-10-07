import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext.tsx';

interface AudioWaveformCanvasProps {
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  accentColor?: string;
  sampleText?: string;
}

export const AudioWaveformCanvas: React.FC<AudioWaveformCanvasProps> = ({
  isPlaying = true,
  onTogglePlay,
  accentColor,
  sampleText = "I've moved your appointment to next Thursday at 10:30 AM with Dr. Aris.",
}) => {
  const { palette } = useTheme();
  const resolvedAccentColor = accentColor || palette.emeraldAccent;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [internalPlaying, setInternalPlaying] = useState(isPlaying);

  useEffect(() => {
    setInternalPlaying(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let phase = 0;

    const barCount = 48;
    const heights = new Array(barCount).fill(10);

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

      phase += internalPlaying ? 0.08 : 0.01;

      for (let i = 0; i < barCount; i++) {
        // Multi-harmonic audio frequency simulation
        const normalizedIdx = i / barCount;
        const centerDistance = Math.abs(normalizedIdx - 0.5) * 2;
        const envelope = Math.max(0.1, 1 - Math.pow(centerDistance, 1.4));

        const targetHeight = internalPlaying
          ? (Math.sin(phase * 1.8 + i * 0.28) * 0.4 +
              Math.sin(phase * 3.2 - i * 0.4) * 0.3 +
              Math.cos(phase * 0.9 + i * 0.6) * 0.3 +
              1) *
              (height * 0.42) *
              envelope +
            8
          : 6 + Math.sin(phase * 0.5 + i * 0.2) * 3;

        // Smooth height transition
        heights[i] += (targetHeight - heights[i]) * 0.15;

        const x = i * (barWidth + barSpacing) + barSpacing / 2;
        const yTop = (height - heights[i]) / 2;

        // Gradient bar
        const gradient = ctx.createLinearGradient(0, yTop, 0, yTop + heights[i]);
        if (internalPlaying) {
          gradient.addColorStop(0, '#34d399');
          gradient.addColorStop(0.5, resolvedAccentColor);
          gradient.addColorStop(1, '#064e3b');
        } else {
          gradient.addColorStop(0, 'rgba(156, 163, 175, 0.4)');
          gradient.addColorStop(1, 'rgba(75, 85, 99, 0.2)');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, yTop, barWidth, heights[i], 3);
        ctx.fill();

        // High frequency glow cap
        if (internalPlaying && heights[i] > height * 0.35) {
          ctx.fillStyle = '#6ee7b7';
          ctx.beginPath();
          ctx.arc(x + barWidth / 2, yTop, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw subtle sine overlay wave
      ctx.beginPath();
      ctx.strokeStyle = internalPlaying ? 'rgba(52, 211, 153, 0.35)' : 'rgba(156, 163, 175, 0.15)';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < width; x += 3) {
        const nx = x / width;
        const wave = Math.sin(nx * 12 + phase * 2) * Math.cos(nx * 6 - phase) * (internalPlaying ? 24 : 4);
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
    const newState = !internalPlaying;
    setInternalPlaying(newState);
    if (onTogglePlay) onTogglePlay();
  };

  return (
    <div className="relative w-full rounded-2xl bg-[#0F0F11] border border-white/10 p-5 md:p-6 overflow-hidden text-white shadow-2xl">
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

      {/* Transcript speech display */}
      <div className="pt-3 border-t border-white/10 flex items-start justify-between gap-4">
        <p className="text-xs md:text-sm text-neutral-300 leading-relaxed font-sans italic">
          "{sampleText}"
        </p>
        <span className="shrink-0 px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Full Duplex
        </span>
      </div>
    </div>
  );
};
