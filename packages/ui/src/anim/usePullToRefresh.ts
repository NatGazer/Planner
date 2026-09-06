import { useCallback, useEffect, useRef } from 'react';
import { animate, useMotionValue, type MotionValue } from 'framer-motion';
import { usePrefersReducedMotion } from './hooks';

export interface PullToRefresh {
  ref: React.RefObject<HTMLDivElement | null>;
  pull: MotionValue<number>;
  refreshing: boolean;
}

/**
 * Pull to refresh, without fighting the browser.
 *
 * A framer `drag="y"` on a scroll container hijacks the gesture and kills
 * native momentum scrolling — the list stops feeling like a list. Instead this
 * attaches one permanently non-passive `touchmove` listener whose very first
 * statement returns unless the list is already at the top and the finger is
 * moving down. In the overwhelming majority of frames that is a handful of
 * instructions and the browser scrolls natively.
 *
 * The gesture writes into a motion value, so React never re-renders while a
 * finger is on the glass. Pull is only ever an accelerator: a visible Refresh
 * control is the primary path, and the only one under reduced motion.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>, { threshold = 72, max = 140 } = {}): PullToRefresh {
  const ref = useRef<HTMLDivElement | null>(null);
  const pull = useMotionValue(0);
  const reduced = usePrefersReducedMotion();
  const startY = useRef<number | null>(null);
  const busy = useRef(false);
  const refreshingRef = useRef(false);

  const finish = useCallback(async () => {
    if (pull.get() < threshold || busy.current) {
      animate(pull, 0, { type: 'spring', stiffness: 320, damping: 32, mass: 0.85 });
      return;
    }
    busy.current = true;
    refreshingRef.current = true;
    animate(pull, 64, { type: 'spring', stiffness: 320, damping: 32 });
    try { await onRefresh(); } finally {
      busy.current = false;
      refreshingRef.current = false;
      animate(pull, 0, { type: 'spring', stiffness: 300, damping: 30, mass: 0.9 });
    }
  }, [onRefresh, pull, threshold]);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return undefined;

    const onStart = (e: TouchEvent) => {
      startY.current = el.scrollTop <= 0 ? e.touches[0].clientY : null;
    };

    const onMove = (e: TouchEvent) => {
      // The hot path: three comparisons, then out.
      if (startY.current === null || busy.current) return;
      if (el.scrollTop > 0) { startY.current = null; pull.set(0); return; }
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { if (pull.get() !== 0) pull.set(0); return; }
      e.preventDefault();
      // Resistance: the further you pull, the less it gives.
      pull.set(Math.min(max, dy * (dy > threshold ? 0.32 : 0.55)));
    };

    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      void finish();
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [finish, max, pull, reduced, threshold]);

  return { ref, pull, refreshing: refreshingRef.current };
}
