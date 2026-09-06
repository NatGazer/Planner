import { useId, useMemo } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../anim/hooks';

/**
 * Charts drawn as plain SVG and animated with stroke and transform only.
 * Colour always comes from `currentColor` or a CSS custom property, so a chart
 * inherits the accent of whatever card it sits in and follows the theme.
 */

// ---------------------------------------------------------------- sparkline

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Draws the area under the line as a soft gradient. */
  fill?: boolean;
  strokeWidth?: number;
  className?: string;
  /** Seconds before the line starts drawing itself. */
  delay?: number;
}

export function Sparkline({
  values, width = 240, height = 56, fill = true, strokeWidth = 2, className, delay = 0.15,
}: SparklineProps) {
  const reduced = usePrefersReducedMotion();
  const gradientId = useId();

  const { line, area } = useMemo(() => {
    if (values.length < 2) return { line: '', area: '' };
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = Math.max(max - min, 1);
    const pad = strokeWidth;
    const stepX = (width - pad * 2) / (values.length - 1);
    const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

    const pts = values.map((v, i) => [pad + i * stepX, y(v)] as const);
    // Catmull-Rom converted to cubic béziers: a smooth curve with no overshoot.
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return { line: d, area: `${d} L ${pts[pts.length - 1][0]} ${height} L ${pts[0][0]} ${height} Z` };
  }, [values, width, height, strokeWidth]);

  if (!line) return null;

  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.30" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? (
        <motion.path
          d={area}
          fill={`url(#${gradientId})`}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: delay + 0.35 }}
        />
      ) : null}
      <motion.path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ pathLength: { duration: 1.1, delay, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.2, delay } }}
      />
    </svg>
  );
}

// --------------------------------------------------------------- bar column

export interface BarsProps {
  values: { label: string; value: number; emphasis?: boolean; title?: string; carried?: number }[];
  height?: number;
  gap?: number;
  radius?: number;
  className?: string;
  delay?: number;
  onSelect?: (index: number) => void;
}

/**
 * A column chart. Each bar is a full-height element scaled on the Y axis from
 * its bottom edge, so growth is one composited transform — never an animated
 * `height`, which would relayout the row on every frame.
 *
 * A bar may carry a second stacked segment (`carried`), used by the workload
 * chart to show the overdue backlog weighing down day one.
 */
export function Bars({ values, height = 96, gap = 4, radius = 5, className, delay = 0.1, onSelect }: BarsProps) {
  const reduced = usePrefersReducedMotion();
  const max = Math.max(...values.map((v) => v.value), 1);

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'flex-end', gap, height }}>
      {values.map((v, i) => {
        const fraction = Math.max(v.value === 0 ? 0.022 : 0.07, v.value / max);
        const carriedFraction = v.carried ? Math.min(v.carried / Math.max(v.value, 1), 1) : 0;
        const Tag = onSelect ? motion.button : motion.div;
        return (
          <Tag
            key={v.label + i}
            type={onSelect ? 'button' : undefined}
            onClick={onSelect ? () => onSelect(i) : undefined}
            title={v.title ?? `${v.label}: ${v.value}`}
            className={`bar${v.emphasis ? ' bar--emphasis' : ''}${v.value === 0 ? ' bar--empty' : ''}`}
            style={{ flex: 1, minWidth: 3, height: '100%', borderRadius: radius, transformOrigin: 'bottom', position: 'relative' }}
            initial={reduced ? { scaleY: fraction } : { scaleY: 0.012, opacity: 0 }}
            animate={{ scaleY: fraction, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 27, mass: 0.7, delay: delay + Math.min(i, 13) * 0.028 }}
          >
            {carriedFraction > 0 ? (
              <span
                className="bar__carried"
                style={{ position: 'absolute', inset: 'auto 0 0 0', height: `${carriedFraction * 100}%`, borderRadius: radius }}
                aria-hidden="true"
              />
            ) : null}
          </Tag>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------- ring

export interface RingProps {
  /** 0 to 1. */
  value: number;
  size?: number;
  thickness?: number;
  /** Seconds before the arc sweeps. */
  delay?: number;
  className?: string;
  trackOpacity?: number;
  children?: React.ReactNode;
}

/** A single sweeping arc — used for the on-time rate and small type gauges. */
export function Ring({ value, size = 92, thickness = 8, delay = 0.2, className, trackOpacity = 0.13, children }: RingProps) {
  const reduced = usePrefersReducedMotion();
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));

  return (
    <div className={className} style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={trackOpacity} strokeWidth={thickness} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor"
          strokeWidth={thickness} strokeLinecap="round"
          strokeDasharray={circumference}
          initial={reduced ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped) }}
          transition={{ duration: 1.15, delay, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      {children ? (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{children}</div>
      ) : null}
    </div>
  );
}

// --------------------------------------------------------------- stack bar

export interface StackProps {
  segments: { key: string; value: number; color: string; label: string }[];
  height?: number;
  className?: string;
  delay?: number;
}

/**
 * A proportional bar — the split of outstanding work by urgency. Proportions
 * are set once in layout; only the container's scaleX animates, so the reveal
 * costs one composited transform rather than a relayout per frame.
 */
export function Stack({ segments, height = 10, className, delay = 0.25 }: StackProps) {
  const reduced = usePrefersReducedMotion();
  const live = segments.filter((s) => s.value > 0);
  const total = live.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <motion.div
      className={className}
      style={{ display: 'flex', gap: 3, height, width: '100%', transformOrigin: 'left center' }}
      initial={reduced ? false : { scaleX: 0.02, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 180, damping: 28, delay }}
    >
      {live.map((s) => (
        <span
          key={s.key}
          title={`${s.label}: ${s.value}`}
          style={{ background: s.color, borderRadius: height, display: 'block', flexGrow: s.value / total, flexBasis: 0 }}
        />
      ))}
    </motion.div>
  );
}
