import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useResource } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { usePrefersReducedMotion } from '@ui/anim/hooks';
import { listContainer, riseIn, stillContainer } from '@ui/anim/motion';
import { Icon, type IconName } from '@ui/components/Icon';
import { Segmented } from '@ui/components/Field';
import { EmptyState, ErrorState, Skeleton } from '@ui/components/states';
import { instantLong, longDate, relative } from '@ui/lib/format';
import type { AuditEntry } from '@ui/lib/types';
import { adminApi } from '../data';

type Scope = 'all' | 'schedule' | 'config';

const ICONS: Record<string, IconName> = {
  'task.rescheduled': 'calendar',
  'task.dormant': 'archive',
  'equipment.created': 'plus',
  'equipment.updated': 'edit',
  'equipment.activated': 'power',
  'equipment.deactivated': 'power',
  'equipment.duplicated': 'copy',
  'equipment.archived': 'archive',
  'rule.created': 'plus',
  'rule.updated': 'edit',
  'rule.activated': 'power',
  'rule.deactivated': 'power',
  'rule.archived': 'archive',
  'type.created': 'plus',
  'type.updated': 'edit',
  'type.archived': 'archive',
};

/**
 * The audit trail. Every reschedule and every configuration change, who made
 * it and when — written in the same transaction as the change itself, so the
 * log can never disagree with the data.
 */
export function ActivityScreen() {
  const { signOut } = useSession();
  const reduced = usePrefersReducedMotion();
  const [scope, setScope] = useState<Scope>('all');
  const log = useResource(() => adminApi.activity(300), []);
  useSignOutOn401(log.error, signOut);

  const entries = useMemo(() => {
    const all = log.data?.activity ?? [];
    if (scope === 'schedule') return all.filter((e) => e.action.startsWith('task.'));
    if (scope === 'config') return all.filter((e) => !e.action.startsWith('task.'));
    return all;
  }, [log.data, scope]);

  const days = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const entry of entries) {
      const day = entry.at.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), entry]);
    }
    return [...map.entries()];
  }, [entries]);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Activity</h1>
          <p className="page__lede">Every configuration change and every reschedule, with who did it and when.</p>
        </div>
      </header>

      <div className="filterbar">
        <Segmented
          ariaLabel="Filter activity" layoutId="actscope" value={scope} onChange={setScope}
          options={[
            { value: 'all', label: 'Everything', count: log.data?.activity.length },
            { value: 'schedule', label: 'Reschedules' },
            { value: 'config', label: 'Configuration' },
          ]}
        />
      </div>

      {log.error && !log.data ? (
        <ErrorState message={log.error.message} onRetry={() => void log.reload()} />
      ) : !log.data ? (
        <div className="stack-list">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={56} radius={14} />)}</div>
      ) : days.length === 0 ? (
        <EmptyState icon="activity" title="Nothing recorded yet" body="Changes to equipment, types, maintenance tasks and schedules will be listed here." />
      ) : (
        <motion.div variants={reduced ? stillContainer : listContainer(days.length, 0.02)} initial="hidden" animate="shown" className="activity">
          {days.map(([day, list]) => (
            <motion.section key={day} variants={riseIn} className="activity__day">
              <header className="activity__day-head">
                <h2>{longDate(day)}</h2>
                <span>{relative(`${day}T12:00:00Z`)}</span>
              </header>
              <ol className="timeline">
                {list.map((entry) => (
                  <li key={entry.id} className="timeline__item">
                    <span className={`timeline__dot timeline__dot--${entry.action.split('.')[0]}`} aria-hidden="true">
                      <Icon name={ICONS[entry.action] ?? 'activity'} size={11} />
                    </span>
                    <div>
                      <p className="timeline__summary">{entry.summary}</p>
                      <p className="timeline__meta">{entry.actor_name} · {instantLong(entry.at)}</p>
                      {entry.detail && typeof entry.detail === 'object' ? <DetailNote detail={entry.detail} /> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </motion.section>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function DetailNote({ detail }: { detail: Record<string, unknown> }) {
  const note = typeof detail.note === 'string' ? detail.note : null;
  const reason = typeof detail.reason === 'string' ? detail.reason : null;
  if (!note && !reason) return null;
  return (
    <p className="timeline__note">
      {reason ? <><Icon name="comment" size={11} /> “{reason}”</> : null}
      {reason && note ? ' · ' : null}
      {note}
    </p>
  );
}
