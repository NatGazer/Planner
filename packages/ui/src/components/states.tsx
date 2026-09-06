import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Icon, type IconName } from './Icon';
import { Button } from './Button';
import { useT } from '../lib/i18n';
import { usePrefersReducedMotion } from '../anim/hooks';

/** A shimmer placeholder. Only `transform` animates, so it costs one layer. */
export function Skeleton({ width, height = 14, radius = 8, className, style }: {
  width?: number | string; height?: number | string; radius?: number; className?: string; style?: React.CSSProperties;
}) {
  return (
    <span
      className={`skeleton${className ? ` ${className}` : ''}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

export function EmptyState({ icon = 'sparkle', title, body, action, tone = 'calm' }: {
  icon?: IconName; title?: string; body?: ReactNode; action?: ReactNode; tone?: 'calm' | 'good' | 'warn';
}) {
  const t = useT();
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      className={`empty empty--${tone}`}
      initial={reduced ? false : { opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <motion.span
        className="empty__badge"
        initial={reduced ? false : { scale: 0.6, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 340, damping: 18, delay: 0.06 }}
      >
        <Icon name={icon} size={26} />
      </motion.span>
      <h3 className="empty__title">{title ?? t('ui.state.emptyTitle')}</h3>
      {body ? <p className="empty__body">{body}</p> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </motion.div>
  );
}

export function ErrorState({ message, onRetry, detail }: { message?: string; onRetry?: () => void; detail?: string }) {
  const t = useT();
  return (
    <div className="error-state" role="alert">
      <span className="error-state__badge"><Icon name="alert" size={22} /></span>
      <div>
        <p className="error-state__message">{message ?? t('ui.state.errorTitle')}</p>
        {detail ? <p className="error-state__detail">{detail}</p> : null}
      </div>
      {onRetry ? <Button variant="secondary" icon="refresh" onClick={onRetry}>{t('common.retry')}</Button> : null}
    </div>
  );
}

/** Full-screen first paint, before any data has arrived. */
export function BootScreen({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="boot">
      <motion.div
        className="boot__mark"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      >
        <svg viewBox="0 0 48 48" width="48" height="48" fill="none" aria-hidden="true">
          <motion.circle
            cx="24" cy="24" r="19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
            strokeDasharray="119.4"
            initial={{ strokeDashoffset: 119.4, rotate: -90 }}
            animate={{ strokeDashoffset: [119.4, 30, 119.4], rotate: [-90, 270, 630] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '50% 50%' }}
          />
          <motion.path
            d="m15 24 6.4 6.4L33 18.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
      </motion.div>
      <p className="boot__label">{label ?? t('common.loading')}</p>
    </div>
  );
}
