import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { useTheme } from '../../../context/ThemeContext.tsx';

export const InteractiveCursor: React.FC = () => {
  const { palette } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [isPointer, setIsPointer] = useState(false);

  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);

  const springConfig = { damping: 28, stiffness: 400 };
  const smoothX = useSpring(cursorX, springConfig);
  const smoothY = useSpring(cursorY, springConfig);

  useEffect(() => {
    // Only enable on desktop with fine pointer
    if (window.matchMedia('(pointer: coarse)').matches) {
      return;
    }

    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
      if (!isVisible) setIsVisible(true);

      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('a') ||
        target.closest('input') ||
        target.closest('[role="button"]') ||
        target.closest('.cursor-pointer')
      ) {
        setIsPointer(true);
      } else {
        setIsPointer(false);
      }
    };

    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    window.addEventListener('mousemove', moveCursor);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      window.removeEventListener('mousemove', moveCursor);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, [cursorX, cursorY, isVisible]);

  if (!isVisible) return null;

  return (
    <motion.div
      style={{
        x: smoothX,
        y: smoothY,
        translateX: '-50%',
        translateY: '-50%',
      }}
      initial={{
        scale: 1,
        borderColor: 'rgba(17, 17, 17, 0.25)',
        backgroundColor: palette.getEmeraldAlpha(0),
      }}
      animate={{
        scale: isPointer ? 1.8 : 1,
        borderColor: isPointer ? palette.getEmeraldAlpha(0.7) : 'rgba(17, 17, 17, 0.25)',
        backgroundColor: isPointer ? palette.getEmeraldAlpha(0.08) : palette.getEmeraldAlpha(0),
      }}
      transition={{ duration: 0.15 }}
      className="fixed top-0 left-0 w-8 h-8 rounded-full border border-neutral-400/40 pointer-events-none z-[9999] backdrop-blur-[0.5px] hidden md:block"
    >
      <motion.div
        animate={{
          scale: isPointer ? 0 : 1,
        }}
        className="w-1.5 h-1.5 rounded-full bg-emerald-accent absolute inset-0 m-auto"
      />
    </motion.div>
  );
};
