import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';
type Resolved = 'dark' | 'light';

interface ThemeValue {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);
const STORAGE_KEY = 'mm.theme';

/**
 * Theme preference is the one thing kept in the browser: it is a per-device
 * display choice, not business data. Everything else lives in the database.
 */
export function ThemeProvider({ children, storageKey = STORAGE_KEY }: { children: ReactNode; storageKey?: string }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
    } catch { /* private mode, or storage disabled */ }
    return 'dark';
  });
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' ? !window.matchMedia('(prefers-color-scheme: light)').matches : true);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setSystemDark(!mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: Resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  // Layout effect, not effect: child components that resolve a CSS custom
  // property on mount (the background shader does) must see the right theme
  // on the very first frame, and child effects run before parent effects.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try { localStorage.setItem(storageKey, next); } catch { /* nothing to do */ }
  }, [storageKey]);

  const toggle = useCallback(() => setMode(resolved === 'dark' ? 'light' : 'dark'), [resolved, setMode]);

  const value = useMemo(() => ({ mode, resolved, setMode, toggle }), [mode, resolved, setMode, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider');
  return ctx;
}
