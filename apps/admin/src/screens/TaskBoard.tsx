import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useResource, useRefreshOnFocus } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { useDebounced, usePrefersReducedMotion } from '@ui/anim/hooks';
import { listContainer, riseIn, stillContainer } from '@ui/anim/motion';
import { Icon } from '@ui/components/Icon';
import { Button } from '@ui/components/Button';
import { SelectField, Segmented, Switch } from '@ui/components/Field';
import { EmptyState, ErrorState, Skeleton } from '@ui/components/states';
import { groupByUrgency } from '@ui/lib/status';
import { longDate, plural } from '@ui/lib/format';
import type { Task } from '@ui/lib/types';
import { adminApi } from '../data';
import { TaskRow } from '../components/primitives';
import { RescheduleDialog } from '../components/RescheduleDialog';

type Bucket = 'all' | 'overdue' | 'today' | 'week' | 'later';

const BUCKETS: { value: Bucket; label: string; tone?: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'overdue', label: 'Overdue', tone: 'overdue' },
  { value: 'today', label: 'Today', tone: 'today' },
  { value: 'week', label: 'This week', tone: 'soon' },
  { value: 'later', label: 'Later' },
];

/**
 * Outstanding work, always ascending by due date — which puts overdue first
 * by construction rather than by a special case — grouped under headings so
 * the eye lands on what is late before anything else.
 */
export function TaskBoard() {
  const { query, navigate } = useRouter();
  const { signOut } = useSession();
  const reduced = usePrefersReducedMotion();

  const [bucket, setBucket] = useState<Bucket>((query.get('bucket') as Bucket) || 'all');
  const onDate = query.get('on');
  const [typeId, setTypeId] = useState(query.get('type') ?? '');
  const [equipmentId, setEquipmentId] = useState(query.get('equipment') ?? '');
  const [search, setSearch] = useState('');
  const [includeHidden, setIncludeHidden] = useState(query.get('hidden') === '1');
  const [rescheduling, setRescheduling] = useState<Task | null>(null);
  const debounced = useDebounced(search, 240);

  const filters = useMemo(() => ({
    bucket: bucket === 'all' ? (query.get('bucket') === 'due-or-overdue' ? 'due-or-overdue' : null) : bucket,
    on: onDate,
    typeId: typeId || null,
    equipmentId: equipmentId || null,
    search: debounced || null,
    includeHidden,
  }), [bucket, onDate, typeId, equipmentId, debounced, includeHidden, query]);

  const list = useResource(() => adminApi.tasks(filters), [JSON.stringify(filters)]);
  const options = useResource(() => Promise.all([adminApi.types(), adminApi.equipment()]), []);
  useRefreshOnFocus(list.reload);
  useSignOutOn401(list.error, signOut);

  const groups = useMemo(() => groupByUrgency(list.data?.tasks ?? []), [list.data]);
  const counts = list.data?.counts;

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Outstanding work</h1>
          <p className="page__lede">
            {counts
              ? <>{plural(counts.total, 'task')} outstanding{counts.overdue ? <> · <span className="text-overdue">{counts.overdue} overdue</span></> : null}</>
              : 'Loading the schedule…'}
          </p>
        </div>
        <div className="page__head-actions">
          <button type="button" className="ghost-link" onClick={() => void list.reload()} disabled={list.refreshing}>
            <Icon name="refresh" size={14} className={list.refreshing ? 'is-spinning' : undefined} /> Refresh
          </button>
        </div>
      </header>

      <div className="filterbar">
        <Segmented
          ariaLabel="Filter by due status"
          layoutId="taskbucket"
          value={bucket}
          onChange={(v) => { setBucket(v); navigate(v === 'all' ? '/tasks' : `/tasks?bucket=${v}`, { replace: true }); }}
          options={BUCKETS.map((b) => ({
            ...b,
            count: b.value === 'all' ? counts?.total
              : b.value === 'overdue' ? counts?.overdue
                : b.value === 'today' ? counts?.today
                  : b.value === 'week' ? counts?.soon : counts?.later,
          }))}
        />
        {onDate ? (
          <div className="filterbar__row">
            <span className="chip is-selected">
              <Icon name="calendar" size={12} /> Due on {longDate(onDate)}
              <button type="button" onClick={() => navigate('/tasks')} aria-label="Clear the date filter" style={{ marginLeft: 4, display: 'grid' }}>
                <Icon name="close" size={12} />
              </button>
            </span>
          </div>
        ) : null}
        <div className="filterbar__row">
          <label className="search">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by asset code, name, location or task"
              aria-label="Search outstanding work"
            />
            {search ? (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><Icon name="close" size={13} /></button>
            ) : null}
          </label>
          <SelectField
            aria-label="Filter by equipment type"
            value={typeId}
            onChange={(e) => { setTypeId(e.target.value); setEquipmentId(''); }}
            placeholder="All types"
            options={(options.data?.[0].types ?? []).map((t) => ({ value: t.id, label: t.name }))}
          />
          <SelectField
            aria-label="Filter by equipment"
            value={equipmentId}
            onChange={(e) => setEquipmentId(e.target.value)}
            placeholder="All equipment"
            options={(options.data?.[1].equipment ?? [])
              .filter((e) => !typeId || e.type.id === typeId)
              .map((e) => ({ value: e.id, label: `${e.code} — ${e.name}` }))}
          />
          <Switch
            label="Include hidden"
            checked={includeHidden}
            onChange={setIncludeHidden}
          />
        </div>
      </div>

      {list.error && !list.data ? (
        <ErrorState message={list.error.message} onRetry={() => void list.reload()} />
      ) : !list.data ? (
        <div className="stack-list">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={62} radius={16} />)}</div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={counts?.total === 0 && !debounced ? 'checkCircle' : 'search'}
          tone={counts?.total === 0 && !debounced ? 'good' : 'calm'}
          title={debounced || typeId || equipmentId ? 'Nothing matches those filters' : 'No outstanding work'}
          body={debounced || typeId || equipmentId
            ? 'Try widening the search, or clear the filters to see the whole schedule.'
            : 'Every scheduled task has been completed. New occurrences appear as they fall due.'}
          action={debounced || typeId || equipmentId
            ? <Button variant="secondary" icon="close" onClick={() => { setSearch(''); setTypeId(''); setEquipmentId(''); setBucket('all'); }}>Clear filters</Button>
            : undefined}
        />
      ) : (
        <motion.div className="task-groups" variants={reduced ? stillContainer : listContainer(groups.length, 0.02)} initial="hidden" animate="shown">
          <AnimatePresence initial={false}>
            {groups.map((group) => (
              <motion.section key={group.bucket} layout className={`task-group ${group.style.className}`} variants={riseIn}>
                <header className="task-group__head">
                  <span className="task-group__badge"><Icon name={group.style.icon} size={13} /></span>
                  <h2 className="task-group__title">{group.style.label}</h2>
                  <span className="task-group__count">{group.tasks.length}</span>
                  <span className="task-group__rule" aria-hidden="true" />
                </header>
                <motion.div className="stack-list" variants={reduced ? stillContainer : listContainer(group.tasks.length)}>
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      today={list.data!.today}
                      onOpen={() => navigate(`/equipment/${task.equipment.id}`)}
                      onReschedule={() => setRescheduling(task)}
                    />
                  ))}
                </motion.div>
              </motion.section>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {list.data?.truncated ? (
        <div className="note-strip">
          <Icon name="info" size={15} />
          <p>
            Showing the <strong>{list.data.shown}</strong> most urgent of{' '}
            <strong>{counts?.total}</strong> outstanding tasks. Narrow it with a type,
            an equipment item or a search to see the rest.
          </p>
        </div>
      ) : null}

      <RescheduleDialog
        task={rescheduling}
        today={list.data?.today ?? ''}
        onClose={() => setRescheduling(null)}
        onDone={() => { setRescheduling(null); void list.reload(); }}
      />
    </div>
  );
}
