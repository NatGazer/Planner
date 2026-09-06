import type { DueBucket, Task } from './types';
import type { IconName } from '../components/Icon';

/**
 * The status language, defined once. Every badge, dot, row tint and chart
 * colour in both apps derives from here, so "overdue" always looks the same.
 */
export interface StatusStyle {
  bucket: DueBucket;
  /** CSS custom property holding this status's colour. */
  cssVar: string;
  label: string;
  shortLabel: string;
  icon: IconName;
  /** Class suffix, e.g. 'is-overdue'. */
  className: string;
}

export const STATUS: Record<DueBucket, StatusStyle> = {
  overdue: { bucket: 'overdue', cssVar: 'var(--status-overdue)', label: 'Overdue', shortLabel: 'Overdue', icon: 'alert', className: 'is-overdue' },
  today: { bucket: 'today', cssVar: 'var(--status-today)', label: 'Due today', shortLabel: 'Today', icon: 'clock', className: 'is-today' },
  soon: { bucket: 'soon', cssVar: 'var(--status-soon)', label: 'Due this week', shortLabel: 'This week', icon: 'calendar', className: 'is-soon' },
  later: { bucket: 'later', cssVar: 'var(--status-later)', label: 'Scheduled', shortLabel: 'Later', icon: 'calendar', className: 'is-later' },
};

export const statusOf = (task: Task): StatusStyle => STATUS[task.due.bucket];

/** Group an ordered task list into its urgency sections, preserving order. */
export function groupByUrgency(tasks: Task[]): { bucket: DueBucket; style: StatusStyle; tasks: Task[] }[] {
  const order: DueBucket[] = ['overdue', 'today', 'soon', 'later'];
  return order
    .map((bucket) => ({ bucket, style: STATUS[bucket], tasks: tasks.filter((t) => t.due.bucket === bucket) }))
    .filter((g) => g.tasks.length > 0);
}

/** The eight type accents, as CSS custom properties. */
export const ACCENTS = ['aurora', 'ice', 'cobalt', 'orchid', 'ember', 'sunset', 'gold', 'lime'] as const;
export type Accent = typeof ACCENTS[number];

export const accentVar = (accent: string) =>
  (ACCENTS as readonly string[]).includes(accent) ? `var(--accent-${accent})` : 'var(--accent-aurora)';

export const accentClass = (accent: string) =>
  `accent-${(ACCENTS as readonly string[]).includes(accent) ? accent : 'aurora'}`;

/**
 * A short, human summary of what is outstanding — used in headers.
 * Always a complete phrase: a list that happens to start at "this week"
 * should not read like a sentence with its beginning cut off.
 */
export function urgencySummary(counts: { overdue: number; today: number; soon: number }): string {
  const parts: string[] = [];
  if (counts.overdue) parts.push(`${counts.overdue} overdue`);
  if (counts.today) parts.push(`${counts.today} due today`);
  if (counts.soon) parts.push(`${counts.soon} due this week`);

  if (!parts.length) return 'Nothing needs attention right now';
  const list = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  // Overdue leads on its own; otherwise say what the number is about.
  return counts.overdue ? list : `Nothing is late — ${list}`;
}
