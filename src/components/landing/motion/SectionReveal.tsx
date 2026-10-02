import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'motion/react';

interface SectionRevealProps {
  children: React.ReactNode;
  delay?: number;
  yOffset?: number;
  duration?: number;
  className?: string;
  id?: string;
  enableParallax?: boolean;
  overflowVisible?: boolean;
}

export const SectionReveal: React.FC<SectionRevealProps> = ({
  children,
  delay = 0,
  yOffset = 32,
  duration = 0.75,
  className = '',
  id,
  enableParallax = true,
  overflowVisible = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Parallax scroll tracking for depth and spatial hierarchy
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  // Smooth out parallax response using spring physics
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 24,
    restDelta: 0.001,
  });

  // Depth transforms:
  // Subtle vertical float for the background spatial aura
  const bgY = useTransform(smoothProgress, [0, 1], [-28, 28]);
  // Subtle scale breath for natural lens perspective
  const bgScale = useTransform(smoothProgress, [0, 0.5, 1], [0.94, 1.04, 0.94]);
  // Ambient radial opacity adjusts as section glides into center view
  const bgOpacity = useTransform(smoothProgress, [0, 0.35, 0.7, 1], [0.15, 0.45, 0.45, 0.15]);

  return (
    <div
      ref={containerRef}
      id={id}
      className={`relative ${overflowVisible ? 'overflow-visible' : 'overflow-hidden'} snap-section lg:snap-start scroll-mt-20 lg:scroll-mt-24 ${className}`}
    >
      {/* Background Spatial Parallax Canvas */}
      {enableParallax && (
        <motion.div
          style={{
            y: bgY,
            scale: bgScale,
            opacity: bgOpacity,
          }}
          className="absolute inset-0 pointer-events-none -z-10 flex items-center justify-center transform-gpu will-change-transform"
          aria-hidden="true"
        >
          {/* Subtle multi-layer depth orbs that float at different rates */}
          <div className="w-[680px] h-[360px] rounded-full bg-gradient-to-tr from-emerald-500/10 via-emerald-300/5 to-transparent blur-3xl" />
          <div className="absolute w-[440px] h-[220px] rounded-full bg-gradient-to-bl from-teal-400/8 via-transparent to-amber-200/5 blur-2xl -translate-y-8" />
        </motion.div>
      )}

      {/* Main Content Entrance Animation */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-25px', amount: 0.08 }}
        variants={{
          hidden: {
            opacity: 0,
            y: yOffset,
          },
          visible: {
            opacity: 1,
            y: 0,
            transition: {
              duration,
              delay,
              ease: [0.22, 1, 0.36, 1], // silky cubic-bezier
            },
          },
        }}
        className="relative z-10"
      >
        {children}
      </motion.div>
    </div>
  );
};
