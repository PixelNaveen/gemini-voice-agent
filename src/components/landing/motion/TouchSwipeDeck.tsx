import React, { useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'motion/react';
import { ChevronLeft, ChevronRight, Hand, Sparkles } from 'lucide-react';
import { useTouchDevice } from '../../../hooks/useTouchDevice.ts';

interface TouchSwipeDeckProps {
  children: React.ReactNode[];
  className?: string;
  minHeightClass?: string;
  showHint?: boolean;
  onIndexChange?: (index: number) => void;
}

export const TouchSwipeDeck: React.FC<TouchSwipeDeckProps> = ({
  children,
  className = '',
  minHeightClass = 'min-h-[440px] sm:min-h-[460px]',
  showHint = true,
  onIndexChange,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const { isTouch, triggerHaptic } = useTouchDevice();

  const total = children.length;
  const progressPercent = ((currentIndex + 1) / total) * 100;

  const paginate = (newDirection: number) => {
    setDirection(newDirection);
    setCurrentIndex((prev) => {
      let next = prev + newDirection;
      if (next < 0) next = total - 1;
      if (next >= total) next = 0;
      if (onIndexChange) onIndexChange(next);
      return next;
    });
    triggerHaptic(14);
  };

  const jumpTo = (index: number) => {
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
    if (onIndexChange) onIndexChange(index);
    triggerHaptic(10);
  };

  // Silky smooth overlapping cross-fade slide transitions
  const slideVariants: Variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? '60%' : '-60%',
      opacity: 0,
      scale: 0.95,
      filter: 'blur(4px)',
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      scale: 1,
      filter: 'blur(0px)',
      transition: {
        x: {
          type: 'spring',
          stiffness: 260,
          damping: 26,
          mass: 0.8,
        },
        opacity: {
          duration: 0.35,
          ease: [0.16, 1, 0.3, 1],
        },
        scale: {
          duration: 0.35,
          ease: [0.16, 1, 0.3, 1],
        },
        filter: {
          duration: 0.25,
        },
      },
    },
    exit: (dir: number) => ({
      zIndex: 0,
      x: dir > 0 ? '-60%' : '60%',
      opacity: 0,
      scale: 0.95,
      filter: 'blur(4px)',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      transition: {
        x: {
          type: 'spring',
          stiffness: 260,
          damping: 26,
          mass: 0.8,
        },
        opacity: {
          duration: 0.28,
          ease: [0.22, 1, 0.36, 1],
        },
        scale: {
          duration: 0.28,
          ease: [0.22, 1, 0.36, 1],
        },
        filter: {
          duration: 0.2,
        },
      },
    }),
  };

  return (
    <div className={`relative w-full select-none overflow-hidden ${className}`}>
      {/* Visual Interactive Indicator: Top Progress Bar & Badge */}
      {showHint && (
        <div className="space-y-2 mb-3">
          {/* Top subtle progress track bar */}
          <div className="w-full h-1 bg-neutral-200/70 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-emerald-600 rounded-full"
              initial={{ width: `${(1 / total) * 100}%` }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          </div>

          {/* Swipe indicator row */}
          <div className="flex items-center justify-between text-xs text-neutral-500 font-mono">
            <span className="inline-flex items-center gap-1.5 text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/70 shadow-2xs">
              <Hand className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
              <span className="font-sans font-medium text-[11px]">Swipe card or tap arrows</span>
            </span>
            <span className="text-[11px] font-mono text-neutral-600 bg-neutral-100/90 px-2 py-0.5 rounded-md border border-neutral-200/60">
              {currentIndex + 1} of {total}
            </span>
          </div>
        </div>
      )}

      {/* Swipeable Viewport with deceleration momentum & rubber-band elastic bounds */}
      <div className={`relative ${minHeightClass} flex items-center justify-center`}>
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.22}
            dragTransition={{
              bounceStiffness: 280,
              bounceDamping: 28,
              power: 0.18,
              timeConstant: 240,
            }}
            onDragEnd={(_, { offset, velocity }) => {
              const swipe = Math.abs(offset.x) * velocity.x;
              if (swipe < -70 || offset.x < -45) {
                paginate(1);
              } else if (swipe > 70 || offset.x > 45) {
                paginate(-1);
              }
            }}
            className="w-full cursor-grab active:cursor-grabbing touch-pan-y"
          >
            {children[currentIndex]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Touch-Optimized Bottom Controls & Spring Pagination Dots */}
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-neutral-200/60">
        <button
          onClick={() => paginate(-1)}
          aria-label="Previous card"
          className="p-2.5 rounded-full bg-white border border-neutral-200/90 text-neutral-700 hover:text-neutral-950 hover:bg-neutral-50 shadow-2xs active:scale-90 transition-transform cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Squishy spring dots with active glow */}
        <div className="flex items-center gap-2">
          {children.map((_, idx) => (
            <button
              key={idx}
              onClick={() => jumpTo(idx)}
              aria-label={`Jump to slide ${idx + 1}`}
              className="relative p-1.5 focus:outline-hidden cursor-pointer group"
            >
              <motion.div
                animate={{
                  width: currentIndex === idx ? 28 : 8,
                  backgroundColor:
                    currentIndex === idx ? '#059669' : 'rgba(212, 212, 216, 0.9)',
                }}
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                className="h-2 rounded-full group-hover:bg-neutral-400 transition-colors"
              />
            </button>
          ))}
        </div>

        <button
          onClick={() => paginate(1)}
          aria-label="Next card"
          className="p-2.5 rounded-full bg-white border border-neutral-200/90 text-neutral-700 hover:text-neutral-950 hover:bg-neutral-50 shadow-2xs active:scale-90 transition-transform cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
