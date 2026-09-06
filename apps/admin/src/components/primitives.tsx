import { forwardRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Icon, type IconName } from '@ui/components/Icon';
import { useCountUp, useTilt, usePrefersReducedMotion } from '@ui/anim/hooks';
import { spring, riseIn } from '@ui/anim/motion';
import { accentClass, STATUS } from '@ui/lib/status';
import { cadence, shortDate } from '@ui/lib/format';
import type { Completion, DueBucket, Task } from '@ui/lib/types';

/* ------------------------------------------------------------------ panel */

export interface PanelProps {
  title: string;
  subtitle?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  /** Makes the whole panel a link into a deeper view. */
  onOpen?: () => void;
  openLabel?: string;
  span?: number;
  tone?: 'plain' | 'accent';
  className?: string;
  children: ReactNode;
  /** Shared-element id, so the panel morphs into the screen it opens. */
  layoutId?: string;
}

export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { title, subtitle, icon, action, onOpen, openLabel = 'Open', span = 6, tone = 'plain', className, children, layoutId }, ref,
) {
  const tilt = useTilt({ max: 3.5, scale: 1.004 });
  return (
    <motion.section
      ref={ref}
      layoutId={layoutId}
      variants={riseIn}
      className={`panel panel--${tone}${onOpen ? ' panel--clickable' : ''}${className ? ` ${className}` : ''}`}
      style={{ gridColumn: `span ${span}`, ...tilt.style }}
      {...tilt.handlers}
    >
      {tilt.glare ? <motion.span className="surface__glare" style={{ '--gx': tilt.glare.x, '--gy': tilt.glare.y, opacity: tilt.glare.opacity } as never} aria-hidden="true" /> : null}
      <header className="panel__head">
        <div className="panel__heading">
          {icon ? <span className="panel__icon"><Icon name={icon} size={15} /></span> : null}
          <div>
            <h2 className="panel__title">{title}</h2>
            {subtitle ? <p className="panel__subtitle">{subtitle}</p> : null}
          </div>
        </div>
        {action ?? (onOpen ? (
          <button type="button" className="panel__open" onClick={onOpen}>
            {openLabel} <Icon name="arrowRight" size={14} />
          </button>
        ) : null)}
      </header>
      <div className="panel__body">{children}</div>
      {onOpen ? <button type="button" className="panel__hitbox" onClick={onOpen} aria-label={`${openLabel}: ${title}`} /> : null}
    </motion.section>
  );
});

/* --------------------------------------------------------------- stat tile */

export interface StatTileProps {
  label: string;
  value: number;
  caption: ReactNode;
  icon: IconName;
  tone: 'neutral' | 'overdue' | 'today' | 'soon';
  onOpen: () => void;
  index?: number;
  sparkline?: ReactNode;
  layoutId?: string;
}

/**
 * The four numbers that matter, at the top of the overview. Each one is a door
 * into the list it counts — the whole tile is the target, not a small link.
 */
export function StatTile({ label, value, caption, icon, tone, onOpen, index = 0, sparkline, layoutId }: StatTileProps) {
  const counter = useCountUp(value, { delay: 0.16 + index * 0.06 });
  const tilt = useTilt({ max: 7, scale: 1.02 });
  const reduced = usePrefersReducedMotion();

  return (
    <motion.button
      type="button"
      layoutId={layoutId}
      variants={riseIn}
      className={`tile tile--${tone}`}
      onClick={onOpen}
      style={tilt.style}
      {...tilt.handlers}
      whileTap={reduced ? undefined : { scale: 0.985 }}
      transition={spring.snap}
    >
      {tilt.glare ? <motion.span className="surface__glare" style={{ '--gx': tilt.glare.x, '--gy': tilt.glare.y, opacity: tilt.glare.opacity } as never} aria-hidden="true" /> : null}
      <span className="tile__top">
        <span className="tile__icon"><Icon name={icon} size={17} /></span>
        <span className="tile__label">{label}</span>
        <Icon name="arrowUpRight" size={15} className="tile__go" />
      </span>
      <span className="tile__value" aria-label={String(value)}>
        <span ref={counter}>{0}</span>
      </span>
      <span className="tile__caption">{caption}</span>
      {sparkline ? <span className="tile__spark">{sparkline}</span> : null}
      {tone === 'overdue' && value > 0 ? <span className="tile__ember" aria-hidden="true" /> : null}
    </motion.button>
  );
}

/* ------------------------------------------------------------- due badge */

export function DueBadge({ bucket, label, compact }: { bucket: DueBucket; label: string; compact?: boolean }) {
  const s = STATUS[bucket];
  return (
    <span className={`due-badge ${s.className}${compact ? ' due-badge--compact' : ''}`}>
      <Icon name={s.icon} size={compact ? 11 : 12} />
      <span>{label}</span>
    </span>
  );
}

export function TypeChip({ type, size = 'md' }: { type: { name: string; accent: string; icon: string } | null; size?: 'sm' | 'md' }) {
  if (!type) return null;
  return (
    <span className={`type-chip type-chip--${size} ${accentClass(type.accent)}`}>
      <Icon name={type.icon as IconName} size={size === 'sm' ? 11 : 13} />
      <span>{type.name}</span>
    </span>
  );
}

/* -------------------------------------------------------------- task row */

export interface TaskRowProps {
  task: Task;
  today: string;
  onOpen?: () => void;
  onReschedule?: () => void;
  showEquipment?: boolean;
  showRule?: boolean;
  dense?: boolean;
}

export function TaskRow({ task, today, onOpen, onReschedule, showEquipment = true, showRule = true, dense }: TaskRowProps) {
  const s = STATUS[task.due.bucket];
  const hidden = !task.equipment.active || !task.rule.active;
  return (
    <motion.div
      layout="position"
      variants={riseIn}
      className={`task-row ${s.className}${dense ? ' task-row--dense' : ''}${hidden ? ' task-row--hidden' : ''}`}
    >
      <span className="task-row__pip" aria-hidden="true" />
      <div className="task-row__main">
        {showRule ? <p className="task-row__title">{task.rule.title}</p> : null}
        {showEquipment ? (
          <p className="task-row__equipment">
            <button type="button" className="task-row__code" onClick={onOpen}>{task.equipment.code}</button>
            <span className="task-row__name">{task.equipment.name}</span>
            {task.equipment.location ? (
              <span className="task-row__location"><Icon name="pin" size={11} /> {task.equipment.location}</span>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="task-row__meta">
        {hidden ? <span className="task-row__flag">Hidden — deactivated</span> : null}
        <span className="task-row__date">{shortDate(task.dueDate, today)}</span>
        <DueBadge bucket={task.due.bucket} label={task.due.label} compact />
        {onReschedule ? (
          <button type="button" className="task-row__action" onClick={onReschedule} title="Reschedule this task">
            <Icon name="calendar" size={14} />
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------- completion row */

export function CompletionRow({ completion, onOpen }: { completion: Completion; onOpen?: () => void }) {
  return (
    <motion.button
      type="button"
      layout="position"
      variants={riseIn}
      className={`completion-row${completion.onTime ? ' is-ontime' : ' is-late'}`}
      onClick={onOpen}
    >
      <span className="completion-row__thumb">
        <img src={`/api/photos/${completion.photoId}`} alt="" loading="lazy" decoding="async" />
      </span>
      <span className="completion-row__main">
        <span className="completion-row__title">{completion.rule.title}</span>
        <span className="completion-row__where">
          <strong>{completion.equipment.code}</strong> {completion.equipment.name}
        </span>
      </span>
      <span className="completion-row__meta">
        <span className="completion-row__who">{completion.employee.name}</span>
        <span className="completion-row__when">{shortDate(completion.completedOn)}</span>
        <span className={`completion-row__punct${completion.onTime ? ' is-ontime' : ' is-late'}`}>
          {completion.onTime
            ? (completion.daysLate === 0 ? 'On the day' : `${-completion.daysLate}d early`)
            : `${completion.daysLate}d late`}
        </span>
      </span>
    </motion.button>
  );
}

/* -------------------------------------------------------------- rule chip */

export function CadenceChip({ value, unit }: { value: number; unit: string }) {
  return <span className="cadence-chip"><Icon name="refresh" size={11} /> {cadence(value, unit)}</span>;
}
