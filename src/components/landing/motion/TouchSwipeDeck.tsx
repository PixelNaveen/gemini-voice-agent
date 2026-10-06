import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { ChevronLeft, ChevronRight, Hand } from 'lucide-react';
import { useTouchDevice } from '../../../hooks/useTouchDevice.ts';

interface TouchSwipeDeckProps {
  children: React.ReactNode[];
  className?: string;
  minHeightClass?: string;
  showHint?: boolean;
  showArrows?: boolean;
  autoPlay?: boolean;
  autoPlayInterval?: number;
  onIndexChange?: (index: number) => void;
}

export const TouchSwipeDeck: React.FC<TouchSwipeDeckProps> = ({
  children,
  className = '',
  minHeightClass = 'min-h-[440px] sm:min-h-[460px]',
  showHint = true,
  showArrows = true,
  autoPlay = false,
  autoPlayInterval = 5000,
  onIndexChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { triggerHaptic } = useTouchDevice();

  const total = children.length;

  // Determine items visible per view based on container width (Tablet: 2 cards, Mobile: 1 card)
  const isTablet = containerWidth >= 640;
  const itemsPerView = isTablet ? 2 : 1;
  const maxIndex = Math.max(0, total - itemsPerView);

  // Auto-play continuous loop
  useEffect(() => {
    if (!autoPlay || maxIndex <= 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev >= maxIndex ? 0 : prev + 1;
        if (onIndexChange) onIndexChange(next);
        return next;
      });
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [autoPlay, autoPlayInterval, maxIndex, onIndexChange]);

  // Measure container width responsively
  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(containerRef.current);
    window.addEventListener('resize', updateWidth, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  const cardWidth = containerWidth > 0 ? containerWidth / itemsPerView : 0;
  const targetX = -currentIndex * cardWidth;

  const dragX = useMotionValue(0);
  const trackX = useSpring(targetX, {
    stiffness: 280,
    damping: 28,
    mass: 0.8,
  });

  // Keep spring in sync with current index target
  useEffect(() => {
    trackX.set(targetX);
  }, [targetX, trackX]);

  const slideTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, maxIndex));
      setCurrentIndex(clamped);
      if (onIndexChange) onIndexChange(clamped);
      triggerHaptic(12);
    },
    [maxIndex, onIndexChange, triggerHaptic]
  );

  const paginate = (direction: number) => {
    slideTo(currentIndex + direction);
  };

  const handleDragEnd = (_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    const swipePower = Math.abs(info.offset.x) * info.velocity.x;
    const swipeThreshold = cardWidth * 0.25;

    if (swipePower < -60 || info.offset.x < -swipeThreshold) {
      if (currentIndex < maxIndex) paginate(1);
      else slideTo(maxIndex);
    } else if (swipePower > 60 || info.offset.x > swipeThreshold) {
      if (currentIndex > 0) paginate(-1);
      else slideTo(0);
    } else {
      slideTo(currentIndex);
    }
  };

  const progressPercent = total > 0 ? ((currentIndex + itemsPerView) / total) * 100 : 0;

  return (
    <div ref={containerRef} className={`relative w-full select-none overflow-hidden ${className}`}>
      {/* Top Reading Progress Bar & Interactive Hint */}
      {showHint && (
        <div className="space-y-2 mb-3">
          <div className="w-full h-1 bg-neutral-200/70 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-emerald-600 rounded-full"
              animate={{ width: `${Math.min(100, Math.max(10, progressPercent))}%` }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-neutral-500 font-mono">
            <span className="inline-flex items-center gap-1.5 text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/70 shadow-2xs">
              <Hand className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
              <span className="font-sans font-medium text-[11px]">
                {isTablet ? 'Showing 2 cards · Swipe or tap arrows' : 'Swipe card or tap arrows'}
              </span>
            </span>
            <span className="text-[11px] font-mono text-neutral-600 bg-neutral-100/90 px-2 py-0.5 rounded-md border border-neutral-200/60">
              {currentIndex + 1}
              {itemsPerView > 1 ? `-${Math.min(total, currentIndex + itemsPerView)}` : ''} of {total}
            </span>
          </div>
        </div>
      )}

      {/* Continuous Multi-Card Viewport Track */}
      <div className={`relative w-full overflow-hidden ${minHeightClass} flex items-stretch touch-pan-y`}>
        {containerWidth > 0 && (
          <motion.div
            style={{ x: trackX }}
            drag="x"
            _dragX={dragX}
            dragConstraints={{
              left: -maxIndex * cardWidth,
              right: 0,
            }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            className="flex items-stretch cursor-grab active:cursor-grabbing w-full"
          >
            {children.map((child, idx) => (
              <div
                key={idx}
                style={{ width: `${cardWidth}px` }}
                className="shrink-0 p-1.5 h-full flex flex-col justify-stretch"
              >
                {child}
              </div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Touch-Optimized Bottom Controls & Pagination Dots */}
      <div
        className={`flex items-center mt-5 pt-4 border-t border-neutral-200/60 ${
          showArrows ? 'justify-between' : 'justify-center'
        }`}
      >
        {showArrows && (
          <button
            onClick={() => paginate(-1)}
            disabled={currentIndex <= 0}
            aria-label="Previous card"
            className="p-2.5 rounded-full bg-white border border-neutral-200/90 text-neutral-700 hover:text-neutral-950 hover:bg-neutral-50 shadow-2xs active:scale-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* Squishy spring dots with active glow */}
        <div className="flex items-center gap-2">
          {Array.from({ length: maxIndex + 1 }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => slideTo(idx)}
              aria-label={`Jump to slide ${idx + 1}`}
              className="relative p-1.5 focus:outline-hidden cursor-pointer group"
            >
              <motion.div
                animate={{
                  width: currentIndex === idx ? 28 : 8,
                  backgroundColor: currentIndex === idx ? '#059669' : 'rgba(212, 212, 216, 0.9)',
                }}
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                className="h-2 rounded-full group-hover:bg-neutral-400 transition-colors"
              />
            </button>
          ))}
        </div>

        {showArrows && (
          <button
            onClick={() => paginate(1)}
            disabled={currentIndex >= maxIndex}
            aria-label="Next card"
            className="p-2.5 rounded-full bg-white border border-neutral-200/90 text-neutral-700 hover:text-neutral-950 hover:bg-neutral-50 shadow-2xs active:scale-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
