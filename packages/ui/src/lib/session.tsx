import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth } from './api';
import { errorMessage } from './errors';
import { setBusinessTimezone } from './format';
import { useT } from './i18n';
import type { Employee } from './types';

interface SessionValue {
  employee: Employee | null;
  /** Today's date in the configured business timezone, as the server sees it. */
  today: string;
  timezone: string;
  status: 'checking' | 'signed-out' | 'signed-in';
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [today, setToday] = useState('');
  const [timezone, setTimezone] = useState('');
  const [status, setStatus] = useState<SessionValue['status']>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    auth.me()
      .then((r) => {
        if (!live) return;
        setEmployee(r.employee); setToday(r.today);
        setTimezone(r.timezone); setBusinessTimezone(r.timezone);
        setStatus('signed-in');
      })
      .catch(() => { if (live) setStatus('signed-out'); });
    return () => { live = false; };
  }, []);

  // The business day can roll over while a screen is left open overnight.
  useEffect(() => {
    if (status !== 'signed-in') return undefined;
    const id = setInterval(() => {
      auth.me().then((r) => { setToday(r.today); }).catch(() => { /* handled on next call */ });
    }, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [status]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const r = await auth.signIn(email, password);
      setEmployee(r.employee);
      setToday(r.today);
      setTimezone(r.timezone);
      setBusinessTimezone(r.timezone);
      setStatus('signed-in');
    } catch (err) {
      setError(errorMessage(t, err));
      throw err;
    }
  }, [t]);

  const signOut = useCallback(async () => {
    await auth.signOut().catch(() => { /* the local session goes either way */ });
    setEmployee(null);
    setStatus('signed-out');
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ employee, today, timezone, status, signIn, signOut, error }),
    [employee, today, timezone, status, signIn, signOut, error],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider');
  return ctx;
}

/**
 * Any API call that comes back 401 means the session ended elsewhere. Rather
 * than let a screen sit there failing, drop straight back to the sign-in view.
 */
export function useSignOutOn401(error: { status?: number } | null, signOut: () => void) {
  useEffect(() => {
    if (error?.status === 401) signOut();
  }, [error, signOut]);
}
