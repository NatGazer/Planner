import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useMotionValue, useSpring, useTransform, animate,
  type MotionValue, type SpringOptions,
} from 'framer-motion';

/**
 * Every hook here degrades to something still and legible when the reader has
 * asked for reduced motion. That is checked once, live, and shared.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * Pointer-driven 3D tilt with a light sheen that tracks the cursor.
 * Everything animates through motion values on the compositor — no React
 * re-render happens while the pointer moves.
 */
export function useTilt({ max = 9, scale = 1.012, glare = true, spring = { stiffness: 260, damping: 26, mass: 0.6 } as SpringOptions } = {}) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const active = useMotionValue(0);

  const rotateX = useSpring(useTransform(py, [0, 1], [max, -max]), spring);
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), spring);
  const lift = useSpring(useTransform(active, [0, 1], [1, scale]), spring);
  const glareX = useTransform(px, (v) => `${v * 100}%`);
  const glareY = useTransform(py, (v) => `${v * 100}%`);
  const glareOpacity = useSpring(useTransform(active, [0, 1], [0, 1]), { stiffness: 180, damping: 30 });

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (reduced) return;
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }, [px, py, reduced]);

  const onPointerEnter = useCallback(() => { if (!reduced) active.set(1); }, [active, reduced]);
  const onPointerLeave = useCallback(() => {
    active.set(0);
    px.set(0.5);
    py.set(0.5);
  }, [active, px, py]);

  const handlers = reduced ? {} : { onPointerMove, onPointerEnter, onPointerLeave };
  return {
    ref,
    handlers,
    style: reduced ? {} : { rotateX, rotateY, scale: lift, transformStyle: 'preserve-3d' as const },
    glare: glare && !reduced ? { x: glareX, y: glareY, opacity: glareOpacity } : null,
    reduced,
  };
}

/**
 * A number that rolls up to its target. Writes straight to the DOM node so a
 * counting stat never re-renders its subtree.
 */
export function useCountUp(value: number, { duration = 1.05, decimals = 0, delay = 0 } = {}) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLSpanElement | null>(null);
  const previous = useRef(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const from = previous.current;
    previous.current = value;
    const render = (n: number) => {
      node.textContent = decimals
        ? n.toFixed(decimals)
        : String(Math.round(n));
    };
    if (reduced || from === value) { render(value); return undefined; }
    const controls = animate(from, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: render,
    });
    return () => controls.stop();
  }, [value, duration, decimals, delay, reduced]);

  return ref;
}

/** Fires once when an element first scrolls into view. */
export function useInView<T extends HTMLElement>(options: IntersectionObserverInit = { rootMargin: '-8% 0px', threshold: 0.05 }) {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, options);
    io.observe(node);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen]);
  return [ref, seen] as const;
}

/** Element drifts a few pixels towards the pointer while it is nearby. */
export function useMagnetic({ strength = 0.28, radius = 90 } = {}) {
  const reduced = usePrefersReducedMotion();
  const x = useSpring(0, { stiffness: 300, damping: 22, mass: 0.4 });
  const y = useSpring(0, { stiffness: 300, damping: 22, mass: 0.4 });

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const distance = Math.hypot(dx, dy);
    const falloff = Math.max(0, 1 - distance / (radius + Math.max(r.width, r.height) / 2));
    x.set(dx * strength * falloff);
    y.set(dy * strength * falloff);
  }, [reduced, strength, radius, x, y]);

  const reset = useCallback(() => { x.set(0); y.set(0); }, [x, y]);
  return {
    style: reduced ? {} : { x, y },
    handlers: reduced ? {} : { onPointerMove, onPointerLeave: reset, onBlur: reset },
  };
}

/** Motion value that eases from 0 to 1 once, for one-shot reveals. */
export function useReveal(delay = 0): MotionValue<number> {
  const value = useMotionValue(0);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced) { value.set(1); return undefined; }
    const controls = animate(value, 1, { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [value, delay, reduced]);
  return value;
}

/** Debounced value, for search fields that must not hammer the API. */
export function useDebounced<T>(value: T, ms = 220): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Media query as state. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    setMatches(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Locks body scroll while a sheet or modal is open. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [active]);
}

/** Closes on Escape. */
export function useEscape(onEscape: () => void, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape, active]);
}

/** Keeps focus inside a dialog while it is open. */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!active || !ref.current) return undefined;
    const root = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const selector = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
    const first = root.querySelector<HTMLElement>(selector);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === firstNode) { e.preventDefault(); lastNode.focus(); }
      else if (!e.shiftKey && document.activeElement === lastNode) { e.preventDefault(); firstNode.focus(); }
    };
    root.addEventListener('keydown', onKey);
    return () => { root.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [active]);
  return ref;
}

/** Stable id for aria wiring. */
export function useId(prefix = 'id'): string {
  return useMemo(() => `${prefix}-${Math.random().toString(36).slice(2, 9)}`, [prefix]);
}
