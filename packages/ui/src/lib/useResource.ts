import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';
import { en } from './strings/en';

export interface Resource<T> {
  data: T | null;
  error: ApiError | null;
  /** True only on the very first load, so refreshes never blank the screen. */
  loading: boolean;
  refreshing: boolean;
  reload: () => Promise<void>;
  /** Optimistic local edit, replaced by the next successful load. */
  set: (next: T | ((prev: T | null) => T)) => void;
}

/**
 * Fetch-and-keep. A reload leaves the previous data on screen and flips
 * `refreshing`, so the interface never flashes an empty state at someone who
 * is already looking at their data.
 */
export function useResource<T>(load: () => Promise<T>, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const hasData = useRef(false);

  const run = useCallback(async () => {
    const mine = ++generation.current;
    if (hasData.current) setRefreshing(true); else setLoading(true);
    try {
      const next = await loadRef.current();
      if (mine !== generation.current) return;
      setData(next);
      hasData.current = true;
      setError(null);
    } catch (err) {
      if (mine !== generation.current) return;
      // Nothing reached the server. Keep the ApiError shape screens expect, and
      // carry the key rather than a sentence: `errorMessage` says it in the
      // reader's language at render time, while `message` stays English for logs.
      setError(err instanceof ApiError ? err : new ApiError(
        { code: 'NETWORK', message: en['common.offline'], detail: { key: 'common.offline' } },
        0,
      ));
    } finally {
      if (mine === generation.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    hasData.current = false;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const set = useCallback((next: T | ((prev: T | null) => T)) => {
    setData((prev) => (typeof next === 'function' ? (next as (p: T | null) => T)(prev) : next));
  }, []);

  return { data, error, loading, refreshing, reload: run, set };
}

/** Re-runs a callback when the tab regains focus, so stale data self-heals. */
export function useRefreshOnFocus(reload: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let last = Date.now();
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - last < 20_000) return;
      last = Date.now();
      reload();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [reload, enabled]);
}
