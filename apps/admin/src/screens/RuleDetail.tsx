import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useResource } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { usePrefersReducedMotion } from '@ui/anim/hooks';
import { listContainer, riseIn, spring, stillContainer } from '@ui/anim/motion';
import { Icon, type IconName } from '@ui/components/Icon';
import { Button } from '@ui/components/Button';
import { Segmented } from '@ui/components/Field';
import { EmptyState, ErrorState, Skeleton } from '@ui/components/states';
import { useToaster } from '@ui/components/Toaster';
import { accentClass } from '@ui/lib/status';
import { cadence, instantLong, plural } from '@ui/lib/format';
import { ApiError } from '@ui/lib/api';
import type { Task } from '@ui/lib/types';
import { adminApi } from '../data';
import { RuleForm } from '../components/RuleForm';
import { CompletionRow, TaskRow } from '../components/primitives';
import { CompletionSheet } from '../components/CompletionSheet';
import { RescheduleDialog } from '../components/RescheduleDialog';
import { ArchiveDialog } from '../components/ArchiveDialog';

type Tab = 'schedule' | 'history' | 'activity';

/** One maintenance task, and every schedule it is currently driving. */
export function RuleDetail({ id }: { id: string }) {
  const { navigate } = useRouter();
  const { signOut } = useSession();
  const toaster = useToaster();
  const reduced = usePrefersReducedMotion();

  const detail = useResource(() => adminApi.ruleDetail(id), [id]);
  const types = useResource(() => adminApi.types(), []);
  useSignOutOn401(detail.error, signOut);

  const [tab, setTab] = useState<Tab>('schedule');
  const [editing, setEditing] = useState(false);
  const [rescheduling, setRescheduling] = useState<Task | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const toggleActive = useCallback(async () => {
    if (!detail.data) return;
    const next = !detail.data.rule.active;
    try {
      await adminApi.updateRule(id, { active: next });
      toaster.success(next ? 'Reactivated' : 'Deactivated', next
        ? 'Pending tasks are visible again at their existing due dates, overdue ones included.'
        : 'Pending tasks are hidden and keep their dates. Completed history is untouched.');
      await detail.reload();
    } catch (err) {
      toaster.error('Could not update', err instanceof ApiError ? err.message : 'Please try again.');
    }
  }, [detail, id, toaster]);

  if (detail.error && !detail.data) {
    return <div className="page"><ErrorState message={detail.error.message} onRetry={() => void detail.reload()} /></div>;
  }
  if (!detail.data) {
    return <div className="page"><Skeleton height={168} radius={22} /><div style={{ height: 20 }} /><div className="stack-list">{[0, 1, 2].map((i) => <Skeleton key={i} height={62} radius={16} />)}</div></div>;
  }

  const { rule, tasks, history, activity, today } = detail.data;
  const visible = tasks.filter((t) => t.equipment.active && t.rule.active);
  const hidden = tasks.length - visible.length;

  return (
    <div className="page">
      <button type="button" className="backlink" onClick={() => navigate('/rules')}>
        <Icon name="chevronLeft" size={15} /> Maintenance
      </button>

      <header className={`hero ${accentClass(rule.type.accent)}${rule.active ? '' : ' is-inactive'}`}>
        <div className="hero__main">
          <span className="hero__glyph"><Icon name={rule.type.icon as IconName} size={26} /></span>
          <div>
            <p className="hero__eyebrow">
              <button type="button" className="hero__code hero__code--link" onClick={() => navigate(`/rules?type=${rule.type.id}`)}>{rule.type.name}</button>
              <span className="hero__type">{cadence(rule.intervalValue, rule.intervalUnit)}</span>
              {!rule.active ? <span className="hero__flag">Deactivated</span> : null}
            </p>
            <h1 className="hero__title">{rule.title}</h1>
            {rule.instructions
              ? <p className="hero__instructions">{rule.instructions}</p>
              : <p className="hero__meta hero__meta-quiet">No instructions written yet — workers see only the title.</p>}
          </div>
        </div>

        <div className="hero__stats">
          <div className="hero-stat"><span className="hero-stat__value">{visible.length}</span><span className="hero-stat__label">Scheduled</span></div>
          <div className="hero-stat"><span className="hero-stat__value">{rule.completionCount}</span><span className="hero-stat__label">Completed</span></div>
        </div>

        <div className="hero__actions">
          <Button variant="secondary" icon="edit" onClick={() => setEditing(true)}>Edit</Button>
          <Button variant={rule.active ? 'ghost' : 'primary'} icon="power" onClick={toggleActive}>
            {rule.active ? 'Deactivate' : 'Reactivate'}
          </Button>
          <Button variant="quiet" icon="archive" onClick={() => setArchiving(true)}>Archive</Button>
        </div>
      </header>

      <Segmented
        ariaLabel="Sections" layoutId="ruletab" className="detail-tabs" value={tab} onChange={setTab}
        options={[
          { value: 'schedule', label: 'Schedule', count: visible.length },
          { value: 'history', label: 'History', count: history.length },
          { value: 'activity', label: 'Activity', count: activity.length },
        ]}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, transition: { duration: 0.14 } }}
          transition={spring.glide}
        >
        {tab === 'schedule' ? (
          <motion.div variants={reduced ? stillContainer : listContainer(visible.length)} initial="hidden" animate="shown" className="detail-body">
            {visible.length ? (
              <div className="stack-list">
                {visible.map((task) => (
                  <TaskRow
                    key={task.id} task={task} today={today} showRule={false}
                    onOpen={() => navigate(`/equipment/${task.equipment.id}`)}
                    onReschedule={() => setRescheduling(task)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="calendar"
                title={rule.active ? 'No equipment of this type yet' : 'Schedules hidden while deactivated'}
                body={rule.active
                  ? 'Add equipment of this type and it will inherit this task with its own schedule.'
                  : 'Every pending occurrence still exists and keeps its date. Reactivate to bring them back.'}
                action={rule.active
                  ? <Button variant="secondary" icon="plus" onClick={() => navigate(`/equipment?type=${rule.type.id}`)}>See equipment</Button>
                  : <Button variant="primary" icon="power" onClick={toggleActive}>Reactivate</Button>}
              />
            )}
            {hidden ? (
              <div className="note-strip">
                <Icon name="info" size={15} />
                <p><strong>{plural(hidden, 'occurrence')}</strong> hidden because the equipment is deactivated. Dates are preserved.</p>
              </div>
            ) : null}
          </motion.div>
        ) : null}

        {tab === 'history' ? (
          <motion.div variants={reduced ? stillContainer : listContainer(history.length)} initial="hidden" animate="shown" className="detail-body">
            {history.length ? (
              <div className="stack-list">{history.map((c) => <CompletionRow key={c.id} completion={c} onOpen={() => setViewing(c.id)} />)}</div>
            ) : (
              <EmptyState icon="history" title="Not completed yet" body="Once this maintenance is carried out, every completion appears here with its photo." />
            )}
          </motion.div>
        ) : null}

        {tab === 'activity' ? (
          <motion.div variants={reduced ? stillContainer : listContainer(activity.length)} initial="hidden" animate="shown" className="detail-body">
            {activity.length ? (
              <ol className="timeline">
                {activity.map((entry) => (
                  <motion.li key={entry.id} variants={riseIn} className="timeline__item">
                    <span className="timeline__dot" aria-hidden="true" />
                    <div>
                      <p className="timeline__summary">{entry.summary}</p>
                      <p className="timeline__meta">{entry.actor_name} · {instantLong(entry.at)}</p>
                      {entry.detail && typeof entry.detail === 'object' && 'note' in entry.detail
                        ? <p className="timeline__note">{String((entry.detail as { note: string }).note)}</p> : null}
                    </div>
                  </motion.li>
                ))}
              </ol>
            ) : <EmptyState icon="activity" title="No changes recorded" />}
          </motion.div>
        ) : null}
        </motion.div>
      </AnimatePresence>

      <RuleForm
        open={editing} onClose={() => setEditing(false)} onSaved={() => void detail.reload()}
        types={types.data?.types ?? []} today={today} existing={rule}
      />
      <RescheduleDialog task={rescheduling} today={today} onClose={() => setRescheduling(null)} onDone={() => { setRescheduling(null); void detail.reload(); }} />
      <ArchiveDialog
        open={archiving}
        onClose={() => setArchiving(false)}
        kind="maintenance task"
        label={rule.title}
        completionCount={rule.completionCount}
        pendingCount={tasks.length}
        archive={() => adminApi.archiveRule(rule.id)}
        onDone={() => navigate('/rules')}
      />

      <CompletionSheet id={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
