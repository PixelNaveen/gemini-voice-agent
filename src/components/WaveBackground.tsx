import React, { useEffect, useRef } from 'react';
import { useCanvasLoop } from './useCanvasLoop';

interface WaveBackgroundProps {
  audioLevel: number; // 0.0 to 1.0 audio amplitude
  isAgentSpeaking: boolean;
  isListening: boolean;
}

interface GoldParticle {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  speedX: number;
  opacity: number;
  pulse: number;
}

// Create background floating gold dust particles
function createParticles(): GoldParticle[] {
  return Array.from({ length: 45 }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    radius: Math.random() * 2 + 0.5,
    speedY: Math.random() * 0.4 + 0.1,
    speedX: (Math.random() - 0.5) * 0.2,
    opacity: Math.random() * 0.6 + 0.2,
    pulse: Math.random() * Math.PI,
  }));
}

export const WaveBackground: React.FC<WaveBackgroundProps> = ({
  audioLevel,
  isAgentSpeaking,
  isListening,
}) => {
  // Held in a ref, not read as a dependency: the loop is started once and kept alive,
  // and `audioLevel` changes ~60x/s. Reading it directly here would restart the loop.
  const drawStateRef = useRef({ audioLevel, isAgentSpeaking, isListening });
  drawStateRef.current = { audioLevel, isAgentSpeaking, isListening };
  const stepRef = useRef(0);
  const particlesRef = useRef<GoldParticle[] | null>(null);

  const canvasRef = useCanvasLoop((canvas, ctx) => {
    const { audioLevel: level, isAgentSpeaking: speaking, isListening: listening } = drawStateRef.current;
    const particles = particlesRef.current ?? (particlesRef.current = createParticles());

    stepRef.current += 0.015;
    const step = stepRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height * 0.55;

    // 1. Base dark gradient background
    const bgGrad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.45,
      50,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.85
    );
    bgGrad.addColorStop(0, '#0c0a09'); // Dark warm stone
    bgGrad.addColorStop(0.5, '#050505'); // Deep black obsidian
    bgGrad.addColorStop(1, '#000000'); // Pure void
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Ambient Gold Radial Glow Halo at center
    const dynamicBoost = speaking ? level * 1.5 + 0.3 : listening ? level * 1.0 + 0.2 : 0.15;
    const haloRadius = Math.min(width, height) * (0.28 + dynamicBoost * 0.25);
    const haloGrad = ctx.createRadialGradient(
      width * 0.5,
      centerY - 50,
      10,
      width * 0.5,
      centerY - 50,
      haloRadius
    );
    haloGrad.addColorStop(0, `rgba(234, 179, 8, ${0.12 + dynamicBoost * 0.18})`); // #EAB308 Gold
    haloGrad.addColorStop(0.4, `rgba(217, 119, 6, ${0.06 + dynamicBoost * 0.08})`); // Warm Amber
    haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(width * 0.5, centerY - 50, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // 3. Render Floating Gold Particles
    particles.forEach((p) => {
      p.y -= p.speedY + dynamicBoost * 0.5;
      p.x += p.speedX + Math.sin(step + p.pulse) * 0.3;
      p.pulse += 0.02;

      if (p.y < 0) {
        p.y = height + 10;
        p.x = Math.random() * width;
      }

      const currentOpacity = (Math.sin(p.pulse) * 0.3 + 0.7) * p.opacity;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * (1 + dynamicBoost * 0.4), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(250, 204, 21, ${currentOpacity})`; // Bright Gold #FACC15
      ctx.fill();
    });

    // 4. Render 4 Dynamic Sinusoidal Liquid Gold Waves
    const waves = [
      {
        amplitude: 35 + dynamicBoost * 90,
        frequency: 0.003,
        speed: 0.02,
        colorStops: ['rgba(234, 179, 8, 0.45)', 'rgba(180, 83, 9, 0.15)'],
        offsetY: -20,
      },
      {
        amplitude: 25 + dynamicBoost * 70,
        frequency: 0.0045,
        speed: -0.018,
        colorStops: ['rgba(250, 204, 21, 0.35)', 'rgba(217, 119, 6, 0.1)'],
        offsetY: 15,
      },
      {
        amplitude: 45 + dynamicBoost * 110,
        frequency: 0.002,
        speed: 0.012,
        colorStops: ['rgba(245, 158, 11, 0.25)', 'rgba(120, 53, 15, 0.05)'],
        offsetY: 0,
      },
      {
        amplitude: 18 + dynamicBoost * 50,
        frequency: 0.006,
        speed: 0.025,
        colorStops: ['rgba(254, 240, 138, 0.5)', 'rgba(202, 138, 4, 0.1)'],
        offsetY: -35,
      },
    ];

    waves.forEach((wave, idx) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, height);

      const currentStep = step * (idx + 1) * 0.7;

      for (let x = 0; x <= width; x += 12) {
        const sin1 = Math.sin(x * wave.frequency + currentStep);
        const sin2 = Math.sin(x * wave.frequency * 1.8 - currentStep * 0.8);
        const y = centerY + wave.offsetY + (sin1 + sin2 * 0.5) * wave.amplitude;
        ctx.lineTo(x, y);
      }

      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, centerY - 100, 0, height);
      grad.addColorStop(0, wave.colorStops[0]);
      grad.addColorStop(1, wave.colorStops[1]);

      ctx.fillStyle = grad;
      ctx.fill();

      // Wave top glowing stroke line
      ctx.beginPath();
      for (let x = 0; x <= width; x += 12) {
        const sin1 = Math.sin(x * wave.frequency + currentStep);
        const sin2 = Math.sin(x * wave.frequency * 1.8 - currentStep * 0.8);
        const y = centerY + wave.offsetY + (sin1 + sin2 * 0.5) * wave.amplitude;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(253, 224, 71, ${0.3 + dynamicBoost * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(234, 179, 8, 0.8)';
      ctx.shadowBlur = 12;
      ctx.stroke();

      ctx.restore();
    });
  });

  // Resizing resets the canvas backing store, which blanks the drawing, so the size is
  // applied independently of the loop and the next frame repaints at the new size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [canvasRef]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 block w-full h-full"
    />
  );
};
