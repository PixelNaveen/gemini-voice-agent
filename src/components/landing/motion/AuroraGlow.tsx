import React from 'react';
import { motion } from 'motion/react';

interface AuroraGlowProps {
  className?: string;
  dark?: boolean;
}

export const AuroraGlow: React.FC<AuroraGlowProps> = ({ className = '', dark = false }) => {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {/* Primary Emerald blob */}
      <motion.div
        animate={{
          x: [0, 60, -40, 0],
          y: [0, -40, 30, 0],
          scale: [1, 1.15, 0.95, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className={`absolute -top-32 left-1/4 w-[550px] h-[550px] rounded-full blur-[130px] opacity-40 ${
          dark ? 'bg-emerald-600/25' : 'bg-emerald-400/20'
        }`}
      />

      {/* Secondary Ash/Teal blob */}
      <motion.div
        animate={{
          x: [0, -70, 50, 0],
          y: [0, 50, -40, 0],
          scale: [1, 0.9, 1.1, 1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 2,
        }}
        className={`absolute top-1/3 right-1/4 w-[480px] h-[480px] rounded-full blur-[140px] opacity-35 ${
          dark ? 'bg-teal-700/20' : 'bg-neutral-300/40'
        }`}
      />
    </div>
  );
};
