import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, type IconName } from './Icon';
import { useT } from '../lib/i18n';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  tone: ToastTone;
  /** Already-translated text: a toast carries words, not keys — the caller has a `t`. */
  title: string;
  body?: string;
  /** ms; 0 keeps it up until dismissed. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToasterValue {
  push: (toast: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
  success: (title: string, body?: string) => number;
  error: (title: string, body?: string) => number;
  info: (title: string, body?: string) => number;
}

const ToasterContext = createContext<ToasterValue | null>(null);

const TONE_ICON: Record<ToastTone, IconName> = {
  success: 'checkCircle', error: 'alert', info: 'info', warning: 'alert',
};

export function ToasterProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-3), { ...toast, id }]);
    const duration = toast.duration ?? (toast.tone === 'error' ? 7000 : 4200);
    if (duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration));
    return id;
  }, [dismiss]);

  const value = useMemo<ToasterValue>(() => ({
    push,
    dismiss,
    success: (title, body) => push({ tone: 'success', title, body }),
    error: (title, body) => push({ tone: 'error', title, body }),
    info: (title, body) => push({ tone: 'info', title, body }),
  }), [push, dismiss]);

  return (
    <ToasterContext.Provider value={value}>
      {children}
      <div className="toaster" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              className={`toast toast--${toast.tone}`}
              initial={{ opacity: 0, y: -18, scale: 0.94, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -12, scale: 0.96, filter: 'blur(4px)', transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
            >
              <span className="toast__icon"><Icon name={TONE_ICON[toast.tone]} size={18} /></span>
              <div className="toast__text">
                <p className="toast__title">{toast.title}</p>
                {toast.body ? <p className="toast__body">{toast.body}</p> : null}
              </div>
              {toast.action ? (
                <button type="button" className="toast__action" onClick={() => { toast.action!.onClick(); dismiss(toast.id); }}>
                  {toast.action.label}
                </button>
              ) : null}
              <button type="button" className="toast__close" onClick={() => dismiss(toast.id)} aria-label={t('ui.toast.dismiss')}>
                <Icon name="close" size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToasterContext.Provider>
  );
}

export function useToaster(): ToasterValue {
  const ctx = useContext(ToasterContext);
  if (!ctx) throw new Error('useToaster must be used inside a ToasterProvider');
  return ctx;
}
