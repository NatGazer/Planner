import type { Transition, Variants } from 'framer-motion';

/**
 * The motion vocabulary. Everything in both apps moves with one of these, so
 * the whole system feels like it was tuned by the same hand.
 *
 * Naming is by character, not by speed: `snap` for controls the finger is on,
 * `glide` for surfaces arriving, `settle` for large panels that should feel
 * weighty, `pop` for confirmations that deserve a little overshoot.
 */
export const spring = {
  /** Controls under the finger: fast, almost no overshoot. */
  snap: { type: 'spring', stiffness: 520, damping: 30, mass: 0.55 } as const satisfies Transition,
  /** The default for content arriving on screen. */
  glide: { type: 'spring', stiffness: 320, damping: 32, mass: 0.85 } as const satisfies Transition,
  /** Large surfaces: sheets, page frames, the detail morph. */
  settle: { type: 'spring', stiffness: 240, damping: 30, mass: 1.05 } as const satisfies Transition,
  /** Success moments and badges: a deliberate, visible overshoot. */
  pop: { type: 'spring', stiffness: 460, damping: 17, mass: 0.7 } as const satisfies Transition,
  /** Shared-element morphs between a card and its detail view. */
  morph: { type: 'spring', stiffness: 300, damping: 34, mass: 0.9 } as const satisfies Transition,
} satisfies Record<string, Transition>;

/** Non-spring easings, for opacity and colour where a spring would look odd. */
export const ease = {
  out: [0.16, 1, 0.3, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
  in: [0.55, 0, 1, 0.45] as const,
};

export const duration = {
  instant: 0.12,
  quick: 0.2,
  base: 0.32,
  slow: 0.55,
};

/**
 * The stagger step, in seconds. It is deliberately constant: compressing the
 * step so a long list finishes in a fixed window makes every long list feel
 * different from every short one. Instead the *index* is clamped where the
 * delay is applied (see `staggerDelay`), so the first dozen items cascade and
 * everything after them arrives together.
 */
export const STAGGER_STEP = 0.042;
export const STAGGER_CAP = 11;

export const staggerFor = (n: number, step = STAGGER_STEP) => (n <= 1 ? 0 : step);

/** Delay for item `i`, clamped so item 60 does not wait two seconds. */
export const staggerDelay = (i: number, step = STAGGER_STEP) => Math.min(i, STAGGER_CAP) * step;

/** A container whose children arrive one after another. */
export const listContainer = (n: number, delayChildren = 0.04): Variants => ({
  hidden: {},
  shown: {
    transition: {
      staggerChildren: staggerFor(n),
      delayChildren,
      // Long lists cascade for the first dozen rows, then land together.
      staggerDirection: 1,
    },
  },
});

/**
 * The standard arrival: up and into place.
 *
 * There is deliberately no `filter: blur()` here. Animating a filter
 * re-rasterises the whole subtree every frame, and this variant is applied to
 * every card and every list row in both apps — it would be the single most
 * expensive thing either app does. Depth on arrival comes from the rotateX in
 * `deckIn` instead, which is one composited matrix.
 */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.985 },
  shown: { opacity: 1, y: 0, scale: 1, transition: spring.glide },
  exit: { opacity: 0, y: -8, scale: 0.99, transition: { duration: duration.quick } },
};

/** Panels arriving on the dashboard: they tip up off the deck. */
export const deckIn: Variants = {
  hidden: { opacity: 0, y: 18, rotateX: -5 },
  shown: { opacity: 1, y: 0, rotateX: 0, transition: spring.settle },
  exit: { opacity: 0, y: -10, transition: { duration: duration.quick } },
};

/** For rows in a dense list: less travel, no blur, cheaper. */
export const rowIn: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: spring.glide },
  exit: { opacity: 0, x: -14, transition: { duration: duration.quick } },
};

/**
 * Whole-screen transitions: the new screen grows out of the point you touched.
 *
 * `AnimatePresence mode="wait"` unmounts the old screen before the new one
 * mounts, so a shared-element `layoutId` across routes can never pair — it
 * would teleport. Anchoring the scale origin to the tapped element gives the
 * same "this came from there" read with two composited properties and no
 * measurement of a freshly-mounted route.
 */
export const zoomIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  shown: { opacity: 1, scale: 1, transition: spring.settle },
  exit: { opacity: 0, scale: 0.965, transition: { duration: duration.quick, ease: ease.in } },
};

/** Lateral movement between sibling screens. */
export const pageIn = (direction: number): Variants => ({
  hidden: { opacity: 0, x: direction * 24, scale: 0.994 },
  shown: { opacity: 1, x: 0, scale: 1, transition: spring.settle },
  exit: { opacity: 0, x: direction * -18, scale: 0.996, transition: { duration: duration.quick } },
});

/**
 * Record where a navigation was triggered from, so the incoming screen can
 * scale out of it. Falls back to the middle of the viewport for keyboard
 * activation and deep links.
 */
export function setZoomOrigin(el: HTMLElement | null) {
  const root = document.documentElement;
  if (!el) {
    root.style.setProperty('--ox', '50%');
    root.style.setProperty('--oy', '42%');
    return;
  }
  const r = el.getBoundingClientRect();
  root.style.setProperty('--ox', `${(((r.x + r.width / 2) / window.innerWidth) * 100).toFixed(2)}%`);
  root.style.setProperty('--oy', `${(((r.y + r.height / 2) / window.innerHeight) * 100).toFixed(2)}%`);
}

/** Reduced-motion replacements: same names, no travel. */
export const still: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: duration.quick } },
  exit: { opacity: 0, transition: { duration: duration.instant } },
};

export const stillContainer: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0 } },
};
