import { useState, useEffect } from 'react';

/**
 * Hook to detect whether the user is on a touch-enabled device (mobile/tablet),
 * and provide safe tactile feedback utilities.
 */
export function useTouchDevice() {
  const [isTouch, setIsTouch] = useState<boolean>(false);

  useEffect(() => {
    const checkTouch = () => {
      const hasTouch =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches;
      setIsTouch(hasTouch);
    };

    checkTouch();
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  /**
   * Triggers a subtle tactile pulse on supporting devices (navigator.vibrate)
   */
  const triggerHaptic = (durationMs = 12) => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(durationMs);
      }
    } catch {
      // Ignored if browser blocks vibration without direct user interaction
    }
  };

  return { isTouch, triggerHaptic };
}
