import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useResource } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { usePrefersReducedMotion } from '@ui/anim/hooks';
import { listContainer, riseIn, stillContainer } from '@ui/anim/motion';
import { Icon, type IconName } from '@ui/components/Icon';
import { Button } from '@ui/components/Button';
import { Segmented, TextField } from '@ui/components/Field';
import { Sheet } from '@ui/components/Sheet';
import { EmptyState, ErrorState, Skeleton } from '@ui/components/states';
import { useToaster } from '@ui/components/Toaster';
import { accentClass } from '@ui/lib/status';
import { instantLong, longDate, plural, relative, shortDate } from '@ui/lib/format';
import { ApiError } from '@ui/lib/api';
import type { Task } from '@ui/lib/types';
import { adminApi } from '../data';
import { EquipmentForm } from '../components/EquipmentForm';
import { CadenceChip, CompletionRow, TaskRow } from '../components/primitives';
import { CompletionSheet } from '../components/CompletionSheet';
import { RescheduleDialog } from '../components/RescheduleDialog';

type Tab = 'schedule' | 'history' | 'activity';

/**
 * One physical item: its own schedule, its own history, its own audit trail.
 * Two items of the same type share nothing but the rules they inherit.
 */
export function EquipmentDetail({ id }: { id: string }) {
  const { navigate } = useRouter();
  const { signOut } = useSession();
  const toaster = useToaster();
  const reduced = usePrefersReducedMotion();

  const detail = useResource(() => adminApi.equipmentDetail(id), [id]);
  const support = useResource(() => Promise.all([adminApi.types(), adminApi.rules()]), []);
  useSignOutOn401(detail.error, signOut);

  const [tab, setTab] = useState<Tab>('schedule');
  const [editing, setEditing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [rescheduling, setRescheduling] = useState<Task | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const toggleActive = useCallback(async () => {
    if (!detail.data) return;
    const next = !detail.data.equipment.active;
    try {
      await adminApi.updateEquipment(id, { active: next });
      toaster.success(
        next ? 'Back in service' : 'Deactivated',
        next
          ? 'Its pending tasks are visible again, at their existing due dates.'
          : 'Pending tasks are hidden and keep their dates. Completed history is untouched.',
      );
      await detail.reload();
    } catch (err) {
      toaster.error('Could not update', err instanceof ApiError ? err.message : 'Please try again.');
    }
  }, [detail, id, toaster]);

  if (detail.error && !detail.data) {
    return <div className="page"><ErrorState message={detail.error.message} onRetry={() => void detail.reload()} /></div>;
  }
  if (!detail.data) {
    return (
      <div className="page">
        <Skeleton height={168} radius={22} />
        <div style={{ height: 20 }} />
        <div className="stack-list">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={62} radius={16} />)}</div>
      </div>
    );
  }

  const { equipment, tasks, history, activity, today } = detail.data;
  const visible = tasks.filter((t) => t.equipment.active && t.rule.active);
  const hidden = tasks.filter((t) => !t.equipment.active || !t.rule.active);

  return (
    <div className="page">
      <button type="button" className="backlink" onClick={() => navigate('/equipment')}>
        <Icon name="chevronLeft" size={15} /> Equipment
      </button>

      <motion.header
        variants={riseIn}
        initial="hidden"
        animate="shown"
        className={`hero ${accentClass(equipment.type.accent)}${equipment.active ? '' : ' is-inactive'}`}
      >
        <div className="hero__main">
          <span className="hero__glyph"><Icon name={equipment.type.icon as IconName} size={26} /></span>
          <div>
            <p className="hero__eyebrow">
              <span className="hero__code">{equipment.code}</span>
              <span className="hero__type">{equipment.type.name}</span>
              {!equipment.active ? <span className="hero__flag">Deactivated</span> : null}
            </p>
            <h1 className="hero__title">{equipment.name}</h1>
            <p className="hero__meta">
              {equipment.location
                ? <><Icon name="pin" size={13} /> {equipment.location}</>
                : <span className="hero__meta-quiet">No location recorded</span>}
              <span className="hero__dot" aria-hidden="true">·</span>
              {equipment.lastCompletedAt
                ? <>Last serviced {relative(equipment.lastCompletedAt)}</>
                : <span className="hero__meta-quiet">Never serviced</span>}
            </p>
          </div>
        </div>

        <div className="hero__stats">
          <HeroStat label="Scheduled" value={visible.length} />
          <HeroStat label="Completed" value={equipment.completionCount} />
          <HeroStat
            label="Next due"
            text={equipment.nextDue ? shortDate(equipment.nextDue, today) : '—'}
            tone={equipment.nextDue && equipment.nextDue < today ? 'overdue' : undefined}
          />
        </div>

        <div className="hero__actions">
          <Button variant="secondary" icon="edit" onClick={() => setEditing(true)}>Edit</Button>
          <Button variant="secondary" icon="copy" onClick={() => setDuplicating(true)}>Duplicate</Button>
          <Button variant={equipment.active ? 'ghost' : 'primary'} icon="power" onClick={toggleActive}>
            {equipment.active ? 'Deactivate' : 'Reactivate'}
          </Button>
        </div>
      </motion.header>

      <Segmented
        ariaLabel="Equipment detail sections"
        layoutId="eqtab"
        className="detail-tabs"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'schedule', label: 'Schedule', count: visible.length },
          { value: 'history', label: 'History', count: history.total },
          { value: 'activity', label: 'Activity', count: activity.length },
        ]}
      />

      {tab === 'schedule' ? (
        <motion.div variants={reduced ? stillContainer : listContainer(visible.length + 1)} initial="hidden" animate="shown" className="detail-body">
          {visible.length ? (
            <div className="stack-list">
              {visible.map((task) => (
                <TaskRow
                  key={task.id} task={task} today={today} showEquipment={false}
                  onReschedule={() => setRescheduling(task)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="calendar"
              title={equipment.active ? 'No maintenance scheduled' : 'Schedule hidden while deactivated'}
              body={equipment.active
                ? 'Add a maintenance task to this equipment type and a schedule opens here automatically.'
                : 'Its pending tasks still exist and keep their due dates. Reactivate the item to bring them back.'}
              action={equipment.active
                ? <Button variant="secondary" icon="plus" onClick={() => navigate(`/rules?type=${equipment.type.id}&new=1`)}>Add a maintenance task</Button>
                : <Button variant="primary" icon="power" onClick={toggleActive}>Reactivate</Button>}
            />
          )}

          {hidden.length ? (
            <motion.div variants={riseIn} className="note-strip">
              <Icon name="info" size={15} />
              <p><strong>{plural(hidden.length, 'pending task')}</strong> hidden because the maintenance task or the equipment is deactivated. Dates are preserved.</p>
            </motion.div>
          ) : null}

          <motion.section variants={riseIn} className="inherited">
            <h3 className="inherited__title">Inherited from {equipment.type.name}</h3>
            <div className="inherited__list">
              {(detail.data.rules ?? []).map((rule) => (
                <button key={rule.id} type="button" className={`inherited__row${rule.active ? '' : ' is-off'}`} onClick={() => navigate(`/rules/${rule.id}`)}>
                  <span className="inherited__name">{rule.title}</span>
                  <CadenceChip value={rule.intervalValue} unit={rule.intervalUnit} />
                  {!rule.active ? <span className="inherited__flag">Deactivated</span> : null}
                  <Icon name="chevronRight" size={14} />
                </button>
              ))}
            </div>
          </motion.section>
        </motion.div>
      ) : null}

      {tab === 'history' ? (
        <motion.div variants={reduced ? stillContainer : listContainer(history.items.length)} initial="hidden" animate="shown" className="detail-body">
          {history.items.length ? (
            <div className="stack-list">
              {history.items.map((c) => <CompletionRow key={c.id} completion={c} onOpen={() => setViewing(c.id)} />)}
            </div>
          ) : (
            <EmptyState icon="history" title="No completed work yet" body="Completions submitted from the worker app appear here, with the photo, the person and the exact time." />
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
                    {entry.detail && typeof entry.detail === 'object' && 'note' in entry.detail ? (
                      <p className="timeline__note">{String((entry.detail as { note: string }).note)}</p>
                    ) : null}
                  </div>
                </motion.li>
              ))}
            </ol>
          ) : (
            <EmptyState icon="activity" title="No changes recorded" body="Configuration changes and reschedules for this item will be listed here." />
          )}
        </motion.div>
      ) : null}

      <EquipmentForm
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={() => void detail.reload()}
        types={support.data?.[0].types ?? []}
        rules={support.data?.[1].rules ?? []}
        today={today}
        existing={equipment}
      />

      <DuplicateSheet
        open={duplicating}
        onClose={() => setDuplicating(false)}
        sourceCode={equipment.code}
        today={today}
        onDone={(codes) => {
          toaster.success(
            codes.length === 1 ? `${codes[0]} created` : `${codes.length} new items created`,
            'Each has a new identifier and a fresh schedule. No history was copied.',
          );
          navigate('/equipment');
        }}
        id={equipment.id}
      />

      <RescheduleDialog
        task={rescheduling}
        today={today}
        onClose={() => setRescheduling(null)}
        onDone={() => { setRescheduling(null); void detail.reload(); }}
      />

      <CompletionSheet id={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function HeroStat({ label, value, text, tone }: { label: string; value?: number; text?: string; tone?: string }) {
  return (
    <div className={`hero-stat${tone ? ` hero-stat--${tone}` : ''}`}>
      <span className="hero-stat__value">{value !== undefined ? value : text}</span>
      <span className="hero-stat__label">{label}</span>
    </div>
  );
}

function DuplicateSheet({ open, onClose, id, sourceCode, today, onDone }: {
  open: boolean; onClose: () => void; id: string; sourceCode: string; today: string; onDone: (codes: string[]) => void;
}) {
  const toaster = useToaster();
  const [code, setCode] = useState('');
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Duplicate this equipment"
      subtitle={`Based on ${sourceCode}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary" loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const { created } = await adminApi.duplicateEquipment(id, { code: code.trim() || undefined, count });
                onDone(created.map((c) => c.code));
                onClose();
              } catch (err) {
                toaster.error('Could not duplicate', err instanceof ApiError ? err.message : 'Please try again.');
              } finally { setBusy(false); }
            }}
          >
            Create {count === 1 ? 'a copy' : `${count} copies`}
          </Button>
        </>
      }
    >
      <p className="sheet__note">
        A duplicate is a new physical item: it gets its own asset code and a schedule that starts fresh today.
        Completion history is never copied — that belongs to the original.
      </p>
      <TextField
        label="Asset code" value={code} onChange={(e) => setCode(e.target.value)}
        placeholder={`${sourceCode}-COPY`}
        hint={count > 1 ? 'A two-digit suffix is added to each copy.' : 'Leave blank to append -COPY to the original code.'}
      />
      <TextField
        label="How many" type="number" min={1} max={50} value={count}
        onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
      />
      <p className="sheet__note sheet__note--quiet">
        First occurrence for each copy falls due one interval from {longDate(today)}.
      </p>
    </Sheet>
  );
}
