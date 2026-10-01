import React, { useRef } from 'react';
import { AgentStatus, VisualizerMode } from '../types';
import { Sparkles, Activity, Radio, Disc } from 'lucide-react';
import { useCanvasLoop } from './useCanvasLoop';

interface CentralVisualizerProps {
  status: AgentStatus;
  audioLevel: number; // 0.0 to 1.0
  isAgentSpeaking: boolean;
  isListening: boolean;
  mode: VisualizerMode;
  onModeChange: (mode: VisualizerMode) => void;
  voiceName: string;
}

export const CentralVisualizer: React.FC<CentralVisualizerProps> = ({
  status,
  audioLevel,
  isAgentSpeaking,
  isListening,
  mode,
  onModeChange,
  voiceName,
}) => {
  // Held in a ref, not read as a dependency: the loop is started once and kept alive,
  // and `audioLevel` changes ~60x/s. Reading it directly here would restart the loop.
  const drawStateRef = useRef({ audioLevel, isAgentSpeaking, isListening, mode });
  drawStateRef.current = { audioLevel, isAgentSpeaking, isListening, mode };
  const timeRef = useRef(0);

  const canvasRef = useCanvasLoop((canvas, ctx) => {
    const { audioLevel: level, isAgentSpeaking: speaking, isListening: listening, mode: drawMode } =
      drawStateRef.current;

    timeRef.current += 0.025;
    const time = timeRef.current;
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Smooth amplitude factor
    const amp = Math.max(0.08, speaking || listening ? level * 1.8 + 0.12 : 0.08);

    if (drawMode === 'orb') {
      // --- 1. ELEVENLABS FLUID ORB MODE ---
      const baseRadius = 85;
      const radius = baseRadius + amp * 45;

      // Outer Glowing Glow Ring
      const glowGrad = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 1.8);
      glowGrad.addColorStop(0, `rgba(234, 179, 8, ${0.4 + amp * 0.5})`);
      glowGrad.addColorStop(0.5, `rgba(180, 83, 9, ${0.2 + amp * 0.3})`);
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();

      // Dynamic concentric ripples
      for (let i = 1; i <= 3; i++) {
        const rippleRadius = radius + ((time * 30 * i) % 70);
        const rippleOpacity = Math.max(0, 1 - rippleRadius / (radius + 70)) * 0.4;
        ctx.beginPath();
        ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(250, 204, 21, ${rippleOpacity})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Fluid morphing sphere outline using sine waves
      ctx.save();
      ctx.beginPath();
      const points = 64;
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const deform1 = Math.sin(angle * 5 + time * 3) * (10 * amp);
        const deform2 = Math.cos(angle * 8 - time * 2) * (6 * amp);
        const r = radius + deform1 + deform2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Inner metallic gold gradient fill
      const orbGrad = ctx.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.3,
        5,
        cx,
        cy,
        radius
      );
      orbGrad.addColorStop(0, '#FEF08A'); // Bright yellow gold highlight
      orbGrad.addColorStop(0.3, '#EAB308'); // Pure Gold
      orbGrad.addColorStop(0.7, '#B45309'); // Warm Amber
      orbGrad.addColorStop(1, '#1c1917'); // Dark obsidian core

      ctx.fillStyle = orbGrad;
      ctx.shadowColor = '#FACC15';
      ctx.shadowBlur = 25 * amp + 10;
      ctx.fill();

      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Revolving orbital particle ring
      const particleCount = 18;
      for (let i = 0; i < particleCount; i++) {
        const pAngle = (i / particleCount) * Math.PI * 2 + time * (1 + amp);
        const pRadius = radius + 22 + Math.sin(time * 2 + i) * 8;
        const px = cx + Math.cos(pAngle) * pRadius;
        const py = cy + Math.sin(pAngle) * pRadius;

        ctx.beginPath();
        ctx.arc(px, py, 2.5 + amp * 2, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 ? '#FACC15' : '#FEF08A';
        ctx.fill();
      }
    } else if (drawMode === 'bars') {
      // --- 2. GOLD SPECTRUM BARS MODE ---
      const barCount = 36;
      const radius = 95;

      for (let i = 0; i < barCount; i++) {
        const angle = (i / barCount) * Math.PI * 2;
        const heightFactor = Math.sin(i * 0.8 + time * 4) * 0.5 + 0.5;
        const barHeight = 15 + heightFactor * amp * 95;

        const x1 = cx + Math.cos(angle) * radius;
        const y1 = cy + Math.sin(angle) * radius;
        const x2 = cx + Math.cos(angle) * (radius + barHeight);
        const y2 = cy + Math.sin(angle) * (radius + barHeight);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = i % 2 === 0 ? '#FACC15' : '#D97706';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.shadowColor = '#EAB308';
        ctx.shadowBlur = 12;
        ctx.stroke();
      }

      // Center glowing circle
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(28, 25, 23, 0.9)';
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    } else if (drawMode === 'wave') {
      // --- 3. ACOUSTIC WAVE RINGS MODE ---
      const ringCount = 5;
      for (let i = 1; i <= ringCount; i++) {
        const r = 30 * i + Math.sin(time * 2 + i) * (amp * 25);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(234, 179, 8, ${0.8 - i * 0.12})`;
        ctx.lineWidth = 3 - i * 0.4;
        ctx.shadowColor = '#EAB308';
        ctx.shadowBlur = 15;
        ctx.stroke();
      }
    } else if (drawMode === 'mesh') {
      // --- 4. 3D FLUID MESH NODE SPHERE ---
      const rows = 8;
      const cols = 16;
      const radius = 90 + amp * 30;

      for (let r = 0; r < rows; r++) {
        const lat = (r / rows) * Math.PI - Math.PI / 2;
        ctx.beginPath();
        for (let c = 0; c <= cols; c++) {
          const lon = (c / cols) * Math.PI * 2 + time;
          const x = cx + Math.cos(lat) * Math.cos(lon) * radius;
          const y = cy + Math.sin(lat) * radius + Math.sin(time * 3 + c) * (amp * 10);

          if (c === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(250, 204, 21, ${0.3 + amp * 0.4})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  });

  return (
    <div className="relative flex flex-col items-center justify-center my-4 z-10">
      {/* Mode Selector Pill */}
      <div className="flex items-center gap-1.5 p-1 bg-stone-900/80 backdrop-blur-md border border-amber-500/20 rounded-full mb-6 shadow-xl shadow-black/60">
        <button
          onClick={() => onModeChange('orb')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
            mode === 'orb'
              ? 'bg-amber-500 text-stone-950 font-semibold shadow-md shadow-amber-500/30'
              : 'text-stone-400 hover:text-amber-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Fluid Orb</span>
        </button>
        <button
          onClick={() => onModeChange('bars')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
            mode === 'bars'
              ? 'bg-amber-500 text-stone-950 font-semibold shadow-md shadow-amber-500/30'
              : 'text-stone-400 hover:text-amber-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Spectrum</span>
        </button>
        <button
          onClick={() => onModeChange('wave')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
            mode === 'wave'
              ? 'bg-amber-500 text-stone-950 font-semibold shadow-md shadow-amber-500/30'
              : 'text-stone-400 hover:text-amber-200'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Rings</span>
        </button>
        <button
          onClick={() => onModeChange('mesh')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
            mode === 'mesh'
              ? 'bg-amber-500 text-stone-950 font-semibold shadow-md shadow-amber-500/30'
              : 'text-stone-400 hover:text-amber-200'
          }`}
        >
          <Disc className="w-3.5 h-3.5" />
          <span>3D Mesh</span>
        </button>
      </div>

      {/* Main Canvas Visualizer Frame */}
      <div className="relative w-[340px] h-[340px] sm:w-[380px] sm:h-[380px] flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="w-full h-full block object-contain"
        />

        {/* Central Brand Badge Inside Orb */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="font-['Cinzel'] tracking-[0.25em] text-lg sm:text-xl font-bold bg-gradient-to-r from-amber-100 via-yellow-300 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(234,179,8,0.5)]">
            AURA
          </span>
          <span className="text-[10px] tracking-widest text-amber-300/80 uppercase font-mono mt-0.5">
            {voiceName} • 3.8 LIVE
          </span>
        </div>
      </div>

      {/* Dynamic Status Indicator Tag below Visualizer */}
      <div className="mt-4 flex items-center gap-2 px-4 py-1.5 rounded-full bg-stone-900/90 border border-amber-500/30 backdrop-blur-md shadow-lg shadow-black/80">
        <span
          className={`w-2 h-2 rounded-full ${
            status === 'speaking'
              ? 'bg-amber-400 animate-ping'
              : status === 'listening'
              ? 'bg-emerald-400 animate-pulse'
              : status === 'connecting'
              ? 'bg-yellow-400 animate-spin'
              : 'bg-stone-500'
          }`}
        />
        <span className="text-xs font-medium tracking-wide uppercase font-mono text-stone-300">
          {status === 'idle' && 'READY • TAP "TAP TO START" TO BEGIN'}
          {status === 'connecting' && 'INITIALIZING HIGH-PERFORMANCE VOICE SESSION...'}
          {status === 'speaking' && 'AURA AGENT SPEAKING...'}
          {status === 'listening' && 'AURA LISTENING (MIC ACTIVE)...'}
          {status === 'muted' && 'MICROPHONE MUTED'}
          {status === 'error' && 'SESSION ERROR — TAP TO RETRY'}
        </span>
      </div>
    </div>
  );
};
