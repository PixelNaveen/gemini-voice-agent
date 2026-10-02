import React from 'react';
import { motion } from 'motion/react';

interface AnimatedSeparatorProps {
  dark?: boolean;
  className?: string;
  delay?: number;
}

export const AnimatedSeparator: React.FC<AnimatedSeparatorProps> = ({
  dark = false,
  className = '',
  delay = 0.05,
}) => {
  return (
    <div
      className={`relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-0 select-none pointer-events-none ${className}`}
      aria-hidden="true"
    >
      <div className="relative flex items-center justify-center">
        {/* Animated Horizontal Line Drawing */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          whileInView={{ scaleX: 1, opacity: 1 }}
          viewport={{ once: true, margin: '-30px' }}
          transition={{
            duration: 1.0,
            delay,
            ease: [0.22, 1, 0.36, 1], // fluid decelerated line expansion
          }}
          className={`h-px w-full origin-center ${
            dark
              ? 'bg-gradient-to-r from-transparent via-white/15 to-transparent'
              : 'bg-gradient-to-r from-transparent via-neutral-200/90 to-transparent'
          }`}
        />

        {/* Center subtle glowing accent beacon */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true, margin: '-30px' }}
          transition={{
            duration: 0.6,
            delay: delay + 0.3,
            ease: 'easeOut',
          }}
          className={`absolute w-1.5 h-1.5 rounded-full ${
            dark
              ? 'bg-emerald-400/60 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
              : 'bg-emerald-600/40 shadow-[0_0_6px_rgba(5,150,105,0.3)]'
          }`}
        />
      </div>
    </div>
  );
};
