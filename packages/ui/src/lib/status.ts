import type { DueBucket, DueInfo, Task } from './types';
import type { IconName } from '../components/Icon';
import type { StringKey, TFunc } from './i18n';

/**
 * The status language, defined once. Every badge, dot, row tint and chart
 * colour in both apps derives from here, so "overdue" always looks the same.
 *
 * Labels are *keys*, not words: the same bucket has to read as "Overdue",
 * "Em atraso" or "En retard" depending on who is holding the phone.
 */
export interface StatusStyle {
  bucket: DueBucket;
  /** CSS custom property holding this status's colour. */
  cssVar: string;
  labelKey: StringKey;
  shortLabelKey: StringKey;
  icon: IconName;
  /** Class suffix, e.g. 'is-overdue'. */
  className: string;
}

export const STATUS: Record<DueBucket, StatusStyle> = {
  overdue: { bucket: 'overdue', cssVar: 'var(--status-overdue)', labelKey: 'status.overdue', shortLabelKey: 'status.overdue.short', icon: 'alert', className: 'is-overdue' },
  today: { bucket: 'today', cssVar: 'var(--status-today)', labelKey: 'status.today', shortLabelKey: 'status.today.short', icon: 'clock', className: 'is-today' },
  soon: { bucket: 'soon', cssVar: 'var(--status-soon)', labelKey: 'status.soon', shortLabelKey: 'status.soon.short', icon: 'calendar', className: 'is-soon' },
  later: { bucket: 'later', cssVar: 'var(--status-later)', labelKey: 'status.later', shortLabelKey: 'status.later.short', icon: 'calendar', className: 'is-later' },
};

export const statusOf = (task: Task): StatusStyle => STATUS[task.due.bucket];

/**
 * How a due date reads, built here rather than taken from the API.
 *
 * The server sends `due.label` in English — it is what the audit log and the
 * server's own logs quote. The screen rebuilds the sentence from `bucket` and
 * `days`, so switching language is instant and needs no round trip.
 */
export function dueLabel(t: TFunc, due: DueInfo): string {
  if (due.bucket === 'overdue') return t('due.overdue', { count: Math.abs(due.days) });
  if (due.days === 0) return t('due.today');
  if (due.days === 1) return t('due.tomorrow');
  return t('due.inDays', { count: due.days });
}

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
 *
 * The list is joined through a key too, because "a, b and c" is "a, b et c"
 * in French and "a, b e c" in Portuguese.
 */
export function urgencySummary(t: TFunc, counts: { overdue: number; today: number; soon: number }): string {
  const parts: string[] = [];
  if (counts.overdue) parts.push(t('urgency.overdue', { count: counts.overdue }));
  if (counts.today) parts.push(t('urgency.today', { count: counts.today }));
  if (counts.soon) parts.push(t('urgency.soon', { count: counts.soon }));

  if (!parts.length) return t('urgency.clear');
  const list = parts.length === 1
    ? parts[0]
    : t('urgency.and', { list: parts.slice(0, -1).join(', '), last: parts[parts.length - 1] });
  // Overdue leads on its own; otherwise say what the number is about.
  return counts.overdue ? list : t('urgency.notLate', { list });
}
