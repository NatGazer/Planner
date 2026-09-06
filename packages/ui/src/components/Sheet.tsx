import { type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useEscape, useFocusTrap, usePrefersReducedMotion, useScrollLock } from '../anim/hooks';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 'center' floats a dialog; 'bottom' rises a sheet; 'side' slides a panel in. */
  placement?: 'center' | 'bottom' | 'side';
  size?: 'sm' | 'md' | 'lg';
  /** Set false for destructive confirmations that must be answered. */
  dismissible?: boolean;
  labelledBy?: string;
}

/**
 * One dialog primitive covering every overlay in both apps.
 *
 * The scrim blurs and darkens; the panel arrives on a spring from the
 * direction it belongs to — a phone sheet rises from the bottom edge, a
 * desktop dialog scales up from slightly behind the screen. Reduced motion
 * gets a plain cross-fade with no travel.
 */
export function Sheet({
  open, onClose, title, subtitle, children, footer,
  placement = 'center', size = 'md', dismissible = true, labelledBy,
}: SheetProps) {
  const reduced = usePrefersReducedMotion();
  useScrollLock(open);
  useEscape(() => { if (dismissible) onClose(); }, open);
  const panelRef = useFocusTrap<HTMLDivElement>(open);

  const variants = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : placement === 'bottom'
      ? {
        initial: { opacity: 0, y: '100%' },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: '100%', transition: { duration: 0.24, ease: [0.4, 0, 1, 1] as const } },
      }
      : placement === 'side'
        ? {
          initial: { opacity: 0, x: 60, filter: 'blur(8px)' },
          animate: { opacity: 1, x: 0, filter: 'blur(0px)' },
          exit: { opacity: 0, x: 40, filter: 'blur(6px)', transition: { duration: 0.2 } },
        }
        : {
          initial: { opacity: 0, scale: 0.94, y: 18, filter: 'blur(10px)' },
          animate: { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' },
          exit: { opacity: 0, scale: 0.97, y: 8, filter: 'blur(6px)', transition: { duration: 0.18 } },
        };

  const body = (
    <AnimatePresence>
      {open ? (
        <div className={`sheet-root sheet-root--${placement}`}>
          <motion.div
            className="sheet-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={dismissible ? onClose : undefined}
          />
          <motion.div
            ref={panelRef}
            className={`sheet sheet--${placement} sheet--${size}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={variants.initial}
            animate={variants.animate}
            exit={variants.exit}
            transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.9 }}
            drag={placement === 'bottom' && !reduced ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              if (placement === 'bottom' && dismissible && (info.offset.y > 120 || info.velocity.y > 700)) onClose();
            }}
          >
            {placement === 'bottom' ? <div className="sheet__grabber" aria-hidden="true" /> : null}
            {title ? (
              <header className="sheet__header">
                <div className="sheet__heading">
                  <h2 className="sheet__title">{title}</h2>
                  {subtitle ? <p className="sheet__subtitle">{subtitle}</p> : null}
                </div>
                {dismissible ? (
                  <button type="button" className="sheet__close" onClick={onClose} aria-label="Close">
                    <Icon name="close" size={16} />
                  </button>
                ) : null}
              </header>
            ) : null}
            <div className="sheet__body">{children}</div>
            {footer ? <footer className="sheet__footer">{footer}</footer> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(body, document.body);
}
