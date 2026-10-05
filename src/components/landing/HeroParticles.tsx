import React, { useEffect, useRef } from 'react';
import { tsParticles } from '@tsparticles/engine';
import { loadSlim } from '@tsparticles/slim';
import { useTheme } from '../../context/ThemeContext.tsx';

export const HeroParticles: React.FC = () => {
  const { palette } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    let particleContainer: any = null;

    const initParticles = async () => {
      try {
        await loadSlim(tsParticles);
        if (!isMounted || !containerRef.current) return;

        particleContainer = await tsParticles.load({
          id: 'hero-tsparticles-canvas',
          element: containerRef.current,
          options: {
            fullScreen: { enable: false, zIndex: 0 },
            background: { color: { value: 'transparent' } },
            fpsLimit: 60,
            interactivity: {
              events: {
                onHover: {
                  enable: true,
                  mode: 'grab',
                },
                resize: {
                  enable: true,
                },
              },
              modes: {
                grab: {
                  distance: 180,
                  links: {
                    opacity: 0.65,
                    color: palette.emeraldAccent,
                  },
                },
              },
            },
            particles: {
              color: {
                value: ['#0C7857', '#047857', '#059669', '#10B981', '#6ee7b7'],
              },
              links: {
                color: '#0C7857',
                distance: 140,
                enable: true,
                opacity: 0.32,
                width: 1.15,
              },
              move: {
                direction: 'none',
                enable: true,
                outModes: {
                  default: 'out',
                },
                random: true,
                speed: 0.7,
                straight: false,
              },
              number: {
                density: {
                  enable: true,
                  width: 900,
                  height: 600,
                },
                value: 56,
              },
              opacity: {
                value: { min: 0.28, max: 0.65 },
                animation: {
                  enable: true,
                  speed: 0.8,
                  sync: false,
                },
              },
              shape: {
                type: 'circle',
              },
              size: {
                value: { min: 1.8, max: 3.8 },
              },
            },
            detectRetina: true,
          },
        });
      } catch (err) {
        console.error('Failed to initialize tsParticles:', err);
      }
    };

    initParticles();

    return () => {
      isMounted = false;
      if (particleContainer && typeof particleContainer.destroy === 'function') {
        particleContainer.destroy();
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      id="hero-tsparticles-canvas"
      className="absolute inset-0 z-0 pointer-events-auto overflow-hidden"
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    />
  );
};
