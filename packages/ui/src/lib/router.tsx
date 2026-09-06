import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * A hash router, in about eighty lines.
 *
 * Hash routing means both apps can be opened straight from a file path, served
 * from any sub-path, or deep-linked into, with no server rewrite rules and no
 * dependency. Routes are simple patterns: '/equipment/:id'.
 */

export interface RouteMatch {
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
}

interface RouterValue extends RouteMatch {
  navigate: (to: string, options?: { replace?: boolean }) => void;
  back: () => void;
  /** How many navigations deep we are — lets views animate in the right direction. */
  depth: number;
}

const RouterContext = createContext<RouterValue | null>(null);

const readHash = (): string => {
  const raw = window.location.hash.replace(/^#/, '');
  return raw.startsWith('/') ? raw : `/${raw}`;
};

export function RouterProvider({ children }: { children: ReactNode }) {
  const [href, setHref] = useState(readHash);
  const [depth, setDepth] = useState(0);

  useEffect(() => {
    const onHash = () => setHref(readHash());
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) window.location.replace('#/');
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    const next = to.startsWith('/') ? to : `/${to}`;
    if (readHash() === next) return;
    setDepth((d) => d + 1);
    if (options?.replace) window.location.replace(`#${next}`);
    else window.location.hash = next;
  }, []);

  const back = useCallback(() => {
    setDepth((d) => Math.max(0, d - 1));
    window.history.back();
  }, []);

  const value = useMemo<RouterValue>(() => {
    const [path, search = ''] = href.split('?');
    return { path, params: {}, query: new URLSearchParams(search), navigate, back, depth };
  }, [href, navigate, back, depth]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside a RouterProvider');
  return ctx;
}

/** Match '/equipment/:id' against the current path, returning its params. */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

/** First matching route wins; `patterns` is ordered most-specific-first. */
export function useMatch(patterns: string[]): { pattern: string; params: Record<string, string> } | null {
  const { path } = useRouter();
  return useMemo(() => {
    for (const pattern of patterns) {
      const params = matchRoute(pattern, path);
      if (params) return { pattern, params };
    }
    return null;
  }, [patterns, path]);
}

export function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '' && v !== false) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
