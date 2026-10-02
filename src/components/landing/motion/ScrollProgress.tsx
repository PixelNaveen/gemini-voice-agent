import React, { useEffect } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';

export const ScrollProgress: React.FC = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 200,
    damping: 30,
    restDelta: 0.001,
  });

  // Dynamically calculate and apply backdrop-filter saturation to CSS root based on scroll
  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', (progress) => {
      // Saturation shifts smoothly from 120% (soft calm at top) to 200% (ultra-vivid glass depth as user explores)
      const dynamicSatLight = 120 + progress * 80;
      // Dark glass saturation shifts from 130% to 220%
      const dynamicSatDark = 130 + progress * 90;

      document.documentElement.style.setProperty(
        '--glass-saturate',
        `${dynamicSatLight.toFixed(1)}%`
      );
      document.documentElement.style.setProperty(
        '--glass-saturate-dark',
        `${dynamicSatDark.toFixed(1)}%`
      );
    });

    return () => unsubscribe();
  }, [scrollYProgress]);

  return (
    <motion.div
      style={{ scaleX }}
      className="fixed top-0 left-0 right-0 h-[2.5px] bg-emerald-accent origin-left z-[100] pointer-events-none"
    />
  );
};
