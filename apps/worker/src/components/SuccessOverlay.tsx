import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Icon } from '@ui/components/Icon';
import { Button } from '@ui/components/Button';
import { useT } from '@ui/lib/i18n';
import { longDate, daysBetween } from '@ui/lib/format';
import { usePrefersReducedMotion, useScrollLock } from '@ui/anim/hooks';
import { spring } from '@ui/anim/motion';

export interface SuccessOverlayProps {
  open: boolean;
  title: string;
  nextDue: string;
  today: string;
  onDone: () => void;
}

/**
 * The payoff. A job well done deserves a moment: the ring closes, the tick
 * draws itself, a burst of sparks goes out, and the app tells you plainly
 * when this comes round again. It dismisses itself after a few seconds so
 * nobody has to tap through it on a busy shift.
 */
export function SuccessOverlay({ open, title, nextDue, today, onDone }: SuccessOverlayProps) {
  const t = useT();
  const reduced = usePrefersReducedMotion();
  useScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(onDone, reduced ? 2200 : 4200);
    return () => clearTimeout(id);
  }, [open, onDone, reduced]);

  // Deterministic spark directions — no randomness, so it looks composed.
  const sparks = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2 + 0.32;
    const reach = 92 + (i % 3) * 26;
    return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach, delay: 0.16 + (i % 5) * 0.018, size: 5 + (i % 3) * 2 };
  }), []);

  const inDays = nextDue && today ? daysBetween(today, nextDue) : 0;

  // Portalled to the body on purpose: the screen it is launched from carries a
  // transform while it animates, and a transformed ancestor becomes the
  // containing block for `position: fixed` — the overlay would be pinned to
  // the screen's box rather than to the viewport.
  const overlay = (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="w-success"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.28 } }}
        >
          <motion.div
            className="w-success__panel"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.86, y: 26, filter: 'blur(12px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -12 }}
            transition={spring.pop}
          >
            <div className="w-success__badge">
              {!reduced ? sparks.map((s, i) => (
                <motion.span
                  key={i}
                  className="w-success__spark"
                  style={{ width: s.size, height: s.size }}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                  animate={{ x: s.x, y: s.y, opacity: [0, 1, 0], scale: [0.4, 1, 0.2] }}
                  transition={{ duration: 0.92, delay: s.delay, ease: [0.16, 1, 0.3, 1] }}
                />
              )) : null}

              <svg viewBox="0 0 96 96" width="96" height="96" fill="none" aria-hidden="true">
                <motion.circle
                  cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"
                  strokeDasharray="264"
                  initial={reduced ? false : { strokeDashoffset: 264, rotate: -90 }}
                  animate={{ strokeDashoffset: 0, rotate: -90 }}
                  transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformOrigin: '50% 50%' }}
                />
                <motion.path
                  d="m30 49.5 12 12 24-27" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
                  initial={reduced ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.4, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                />
              </svg>
            </div>

            <motion.h2
              className="w-success__title"
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.34, ...spring.glide }}
            >
              {t('worker.success.title')}
            </motion.h2>
            <motion.p
              className="w-success__what"
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, ...spring.glide }}
            >
              {title}
            </motion.p>

            <motion.div
              className="w-success__next"
              initial={reduced ? false : { opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.48, ...spring.glide }}
            >
              <Icon name="calendar" size={14} />
              <span>
                {t('worker.success.next', { date: nextDue ? longDate(nextDue) : '—' })}
                {inDays > 0 ? <span className="w-success__in"> · {t('worker.success.inDays', { count: inDays })}</span> : null}
              </span>
            </motion.div>

            <motion.div
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              style={{ width: '100%' }}
            >
              <Button variant="secondary" size="lg" block onClick={onDone} iconAfter="arrowRight">
                {t('worker.success.backToList')}
              </Button>
            </motion.div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(overlay, document.body);
}
