import { useEffect, useRef } from 'react';

type CanvasDraw = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => void;

/**
 * Owns the single requestAnimationFrame loop for a canvas component.
 *
 * Two things this replaces. First, the loop used to be started from an effect whose
 * dependencies included `audioLevel`, so the loop was torn down and rebuilt ~60x/s and
 * the animation clock never advanced past its first frame. Anything `draw` reads must
 * therefore live in a ref, never in the dependency list. Second, a mounted canvas used
 * to burn a frame budget even when scrolled out of view or when the tab was hidden;
 * drawing is suspended for those cases and the pending frame is always cancelled on
 * unmount so a closed session leaves nothing scheduled.
 */
export function useCanvasLoop(draw: CanvasDraw): React.RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef<CanvasDraw>(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId = 0;
    let isOnScreen = true;

    const tick = () => {
      drawRef.current(canvas, ctx);
      frameId = requestAnimationFrame(tick);
    };

    const syncLoop = () => {
      const shouldRun = isOnScreen && !document.hidden;
      if (shouldRun && frameId === 0) {
        frameId = requestAnimationFrame(tick);
      } else if (!shouldRun && frameId !== 0) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    };

    // Absent in some test environments; the loop simply stays unsuspended there.
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            isOnScreen = entries.some((entry) => entry.isIntersecting);
            syncLoop();
          });

    observer?.observe(canvas);
    document.addEventListener('visibilitychange', syncLoop);
    syncLoop();

    return () => {
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', syncLoop);
    };
  }, []);

  return canvasRef;
}
