import React, { useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

interface CursorSpotlightProps {
  size?: number;
  color?: string;
  opacity?: number;
  className?: string;
}

export const CursorSpotlight: React.FC<CursorSpotlightProps> = ({
  size = 650,
  color = 'rgba(5, 150, 105, 0.15)',
  opacity = 1,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(-size);
  const mouseY = useMotionValue(-size);
  const spotlightOpacity = useMotionValue(0);

  // Smooth springs for high-end cinematic trailing feel
  const springX = useSpring(mouseX, { stiffness: 160, damping: 26, mass: 0.1 });
  const springY = useSpring(mouseY, { stiffness: 160, damping: 26, mass: 0.1 });
  const springOpacity = useSpring(spotlightOpacity, { stiffness: 200, damping: 24 });

  useEffect(() => {
    const parent = containerRef.current?.parentElement;
    if (!parent) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Ignore on coarse pointers (touchscreens)
      if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
        return;
      }

      const rect = parent.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      mouseX.set(x);
      mouseY.set(y);
      spotlightOpacity.set(opacity);
    };

    const handleMouseEnter = () => {
      spotlightOpacity.set(opacity);
    };

    const handleMouseLeave = () => {
      spotlightOpacity.set(0);
    };

    parent.addEventListener('mousemove', handleMouseMove);
    parent.addEventListener('mouseenter', handleMouseEnter);
    parent.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      parent.removeEventListener('mousemove', handleMouseMove);
      parent.removeEventListener('mouseenter', handleMouseEnter);
      parent.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [opacity, mouseX, mouseY, spotlightOpacity]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden pointer-events-none select-none z-0 ${className}`}
      aria-hidden="true"
    >
      <motion.div
        style={{
          x: springX,
          y: springY,
          opacity: springOpacity,
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          background: `radial-gradient(circle closest-side, ${color}, rgba(16, 185, 129, 0.04) 45%, rgba(16, 185, 129, 0) 75%)`,
        }}
        className="absolute rounded-full blur-2xl"
      />
    </div>
  );
};
