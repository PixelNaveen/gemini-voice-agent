import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { useTouchDevice } from '../../../hooks/useTouchDevice.ts';

interface ShinyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'dark' | 'outline';
  magnetic?: boolean;
}

export const ShinyButton: React.FC<ShinyButtonProps> = ({
  children,
  className = '',
  variant = 'primary',
  magnetic = true,
  onClick,
  type = 'button',
  ...props
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { triggerHaptic } = useTouchDevice();

  // Framer Motion magnetic displacement values

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const contentX = useMotionValue(0);
  const contentY = useMotionValue(0);

  // Smooth springs for magnetic button container
  const springX = useSpring(mouseX, { stiffness: 280, damping: 18, mass: 0.1 });
  const springY = useSpring(mouseY, { stiffness: 280, damping: 18, mass: 0.1 });

  // Secondary spring for subtle inner content parallax
  const springContentX = useSpring(contentX, { stiffness: 320, damping: 20 });
  const springContentY = useSpring(contentY, { stiffness: 320, damping: 20 });

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!magnetic || !buttonRef.current) return;

    // Check if pointer is coarse (e.g., touch device)
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Displacement offset for button frame (subtle max ~8px)
    const distanceX = (e.clientX - centerX) * 0.22;
    const distanceY = (e.clientY - centerY) * 0.22;

    mouseX.set(distanceX);
    mouseY.set(distanceY);

    // Parallax content displacement
    contentX.set(distanceX * 0.4);
    contentY.set(distanceY * 0.4);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    contentX.set(0);
    contentY.set(0);
  };

  const handleTouchEnd = () => {
    mouseX.set(0);
    mouseY.set(0);
    contentX.set(0);
    contentY.set(0);
  };

  const variantStyles = {
    primary:
      'bg-emerald-accent hover:bg-emerald-accent-hover text-white shadow-sm hover:shadow-md border border-emerald-600/30',
    secondary:
      'bg-white hover:bg-neutral-50 text-neutral-900 border border-neutral-200/90 shadow-2xs hover:shadow-xs',
    dark: 'bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-800 shadow-sm',
    outline:
      'bg-transparent hover:bg-white/10 text-white border border-white/20 hover:border-white/40',
  };

  return (
    <motion.button
      ref={buttonRef}
      type={type}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onTouchStart={() => triggerHaptic(12)}
      onTouchEnd={handleTouchEnd}
      onClick={onClick}
      style={{
        x: magnetic ? springX : 0,
        y: magnetic ? springY : 0,
      }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 450, damping: 24 }}
      className={`group relative overflow-hidden rounded-full font-medium transition-colors cursor-pointer select-none active:outline-hidden ${variantStyles[variant]} ${className}`}
      {...(props as any)}
    >
      {/* Animated Light Shimmer Streak */}
      <span
        className="pointer-events-none absolute -inset-full top-0 block -rotate-45 bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-hover:animate-[shimmer_1.4s_infinite]"
        style={{
          width: '200%',
          height: '200%',
        }}
      />
      <motion.span
        style={{
          x: magnetic ? springContentX : 0,
          y: magnetic ? springContentY : 0,
        }}
        className="relative z-10 flex items-center justify-center gap-2 pointer-events-none"
      >
        {children}
      </motion.span>
    </motion.button>
  );
};
