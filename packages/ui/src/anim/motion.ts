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

/** Stagger step, in seconds, for a list of n items — capped so long lists
 *  never make the reader wait for the bottom of the page. */
export const staggerFor = (n: number, step = 0.038, budget = 0.42) =>
  (n <= 1 ? 0 : Math.min(step, budget / (n - 1)));

/** A container whose children arrive one after another. */
export const listContainer = (n: number, delayChildren = 0.04): Variants => ({
  hidden: {},
  shown: { transition: { staggerChildren: staggerFor(n), delayChildren } },
});

/** The standard arrival: up, into focus, into place. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.985, filter: 'blur(7px)' },
  shown: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: spring.glide },
  exit: { opacity: 0, y: -8, scale: 0.99, filter: 'blur(5px)', transition: { duration: duration.quick } },
};

/** For rows in a dense list: less travel, no blur, cheaper. */
export const rowIn: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: spring.glide },
  exit: { opacity: 0, x: -14, transition: { duration: duration.quick } },
};

/** Whole-page transitions. `direction` is +1 going deeper, -1 coming back. */
export const pageIn = (direction: number): Variants => ({
  hidden: { opacity: 0, x: direction * 26, filter: 'blur(8px)', scale: 0.992 },
  shown: { opacity: 1, x: 0, filter: 'blur(0px)', scale: 1, transition: spring.settle },
  exit: { opacity: 0, x: direction * -20, filter: 'blur(6px)', scale: 0.994, transition: { duration: duration.quick } },
});

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
