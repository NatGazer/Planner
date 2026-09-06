import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useResource } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { usePrefersReducedMotion } from '@ui/anim/hooks';
import { listContainer, riseIn, spring, stillContainer } from '@ui/anim/motion';
import { Icon, type IconName } from '@ui/components/Icon';
import { Button } from '@ui/components/Button';
import { Segmented, TextField } from '@ui/components/Field';
import { Sheet } from '@ui/components/Sheet';
import { EmptyState, ErrorState, Skeleton } from '@ui/components/states';
import { useToaster } from '@ui/components/Toaster';
import { accentClass } from '@ui/lib/status';
import { errorMessage } from '@ui/lib/errors';
import { useT } from '@ui/lib/i18n';
import { instantLong, longDate, relative, shortDate } from '@ui/lib/format';
import type { Task } from '@ui/lib/types';
import { adminApi } from '../data';
import { EquipmentForm } from '../components/EquipmentForm';
import { CadenceChip, CompletionRow, TaskRow } from '../components/primitives';
import { CompletionSheet } from '../components/CompletionSheet';
import { RescheduleDialog } from '../components/RescheduleDialog';
import { ArchiveDialog } from '../components/ArchiveDialog';

type Tab = 'schedule' | 'history' | 'activity';

/**
 * One physical item: its own schedule, its own history, its own audit trail.
 * Two items of the same type share nothing but the rules they inherit.
 */
export function EquipmentDetail({ id }: { id: string }) {
  const t = useT();
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
  const [archiving, setArchiving] = useState(false);

  const toggleActive = useCallback(async () => {
    if (!detail.data) return;
    const next = !detail.data.equipment.active;
    try {
      await adminApi.updateEquipment(id, { active: next });
      toaster.success(
        next ? t('admin.equipmentDetail.reactivated') : t('admin.equipmentDetail.deactivated'),
        next
          ? t('admin.equipmentDetail.reactivatedBody')
          : t('admin.equipmentDetail.deactivatedBody'),
      );
      await detail.reload();
    } catch (err) {
      toaster.error(t('admin.equipmentDetail.updateFailed'), errorMessage(t, err));
    }
  }, [detail, id, t, toaster]);

  if (detail.error && !detail.data) {
    return <div className="page"><ErrorState message={errorMessage(t, detail.error)} onRetry={() => void detail.reload()} /></div>;
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
  const visible = tasks.filter((task) => task.equipment.active && task.rule.active);
  const hidden = tasks.filter((task) => !task.equipment.active || !task.rule.active);

  return (
    <div className="page">
      <button type="button" className="backlink" onClick={() => navigate('/equipment')}>
        <Icon name="chevronLeft" size={15} /> {t('admin.equipmentDetail.backToEquipment')}
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
              {!equipment.active ? <span className="hero__flag">{t('admin.equipmentDetail.flag.deactivated')}</span> : null}
            </p>
            <h1 className="hero__title">{equipment.name}</h1>
            <p className="hero__meta">
              {equipment.location
                ? <><Icon name="pin" size={13} /> {equipment.location}</>
                : <span className="hero__meta-quiet">{t('admin.equipmentDetail.noLocation')}</span>}
              <span className="hero__dot" aria-hidden="true">·</span>
              {equipment.lastCompletedAt
                ? t('admin.equipmentDetail.lastServiced', { when: relative(equipment.lastCompletedAt) })
                : <span className="hero__meta-quiet">{t('admin.equipmentDetail.neverServiced')}</span>}
            </p>
          </div>
        </div>

        <div className="hero__stats">
          <HeroStat label={t('admin.equipmentDetail.stat.scheduled')} value={visible.length} />
          <HeroStat label={t('admin.equipmentDetail.stat.completed')} value={equipment.completionCount} />
          <HeroStat
            label={t('admin.equipmentDetail.stat.nextDue')}
            text={equipment.nextDue ? shortDate(equipment.nextDue, today) : '—'}
            tone={equipment.nextDue && equipment.nextDue < today ? 'overdue' : undefined}
          />
        </div>

        <div className="hero__actions">
          <Button variant="secondary" icon="edit" onClick={() => setEditing(true)}>{t('admin.equipmentDetail.action.edit')}</Button>
          <Button variant="secondary" icon="copy" onClick={() => setDuplicating(true)}>{t('admin.equipmentDetail.action.duplicate')}</Button>
          <Button variant={equipment.active ? 'ghost' : 'primary'} icon="power" onClick={toggleActive}>
            {equipment.active ? t('admin.equipmentDetail.action.deactivate') : t('admin.equipmentDetail.action.reactivate')}
          </Button>
          <Button variant="quiet" icon="archive" onClick={() => setArchiving(true)}>{t('admin.equipmentDetail.action.archive')}</Button>
        </div>
      </motion.header>

      <Segmented
        ariaLabel={t('admin.equipmentDetail.tabs.aria')}
        layoutId="eqtab"
        className="detail-tabs"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'schedule', label: t('admin.equipmentDetail.tab.schedule'), count: visible.length },
          { value: 'history', label: t('admin.equipmentDetail.tab.history'), count: history.total },
          { value: 'activity', label: t('admin.equipmentDetail.tab.activity'), count: activity.length },
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
                title={equipment.active
                  ? t('admin.equipmentDetail.empty.scheduleTitle')
                  : t('admin.equipmentDetail.empty.hiddenTitle')}
                body={equipment.active
                  ? t('admin.equipmentDetail.empty.scheduleBody')
                  : t('admin.equipmentDetail.empty.hiddenBody')}
                action={equipment.active
                  ? <Button variant="secondary" icon="plus" onClick={() => navigate(`/rules?type=${equipment.type.id}&new=1`)}>{t('admin.equipmentDetail.empty.addTask')}</Button>
                  : <Button variant="primary" icon="power" onClick={toggleActive}>{t('admin.equipmentDetail.action.reactivate')}</Button>}
              />
            )}

            {hidden.length ? (
              <motion.div variants={riseIn} className="note-strip">
                <Icon name="info" size={15} />
                <p>{t('admin.equipmentDetail.hiddenNote', { count: hidden.length })}</p>
              </motion.div>
            ) : null}

            <motion.section variants={riseIn} className="inherited">
              <h3 className="inherited__title">{t('admin.equipmentDetail.inheritedFrom', { type: equipment.type.name })}</h3>
              <div className="inherited__list">
                {(detail.data.rules ?? []).map((rule) => (
                  <button key={rule.id} type="button" className={`inherited__row${rule.active ? '' : ' is-off'}`} onClick={() => navigate(`/rules/${rule.id}`)}>
                    <span className="inherited__name">{rule.title}</span>
                    <CadenceChip value={rule.intervalValue} unit={rule.intervalUnit} />
                    {!rule.active ? <span className="inherited__flag">{t('admin.equipmentDetail.rule.deactivatedFlag')}</span> : null}
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
              <EmptyState icon="history" title={t('admin.equipmentDetail.empty.historyTitle')} body={t('admin.equipmentDetail.empty.historyBody')} />
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
              <EmptyState icon="activity" title={t('admin.equipmentDetail.empty.activityTitle')} body={t('admin.equipmentDetail.empty.activityBody')} />
            )}
          </motion.div>
        ) : null}
        </motion.div>
      </AnimatePresence>

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
            t('admin.equipmentDetail.duplicated', { count: codes.length, code: codes[0] }),
            t('admin.equipmentDetail.duplicatedBody'),
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

      <ArchiveDialog
        open={archiving}
        onClose={() => setArchiving(false)}
        kind="equipment"
        label={`${equipment.code} — ${equipment.name}`}
        completionCount={equipment.completionCount}
        pendingCount={tasks.length}
        archive={() => adminApi.archiveEquipment(equipment.id)}
        onDone={() => navigate('/equipment')}
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
  const t = useT();
  const toaster = useToaster();
  const [code, setCode] = useState('');
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('admin.equipmentDetail.duplicate.title')}
      subtitle={t('admin.equipmentDetail.duplicate.subtitle', { code: sourceCode })}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary" loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const { created } = await adminApi.duplicateEquipment(id, { code: code.trim() || undefined, count });
                onDone(created.map((c) => c.code));
                onClose();
              } catch (err) {
                toaster.error(t('admin.equipmentDetail.duplicate.failed'), errorMessage(t, err));
              } finally { setBusy(false); }
            }}
          >
            {t('admin.equipmentDetail.duplicate.submit', { count })}
          </Button>
        </>
      }
    >
      <p className="sheet__note">
        {t('admin.equipmentDetail.duplicate.note')}
      </p>
      <TextField
        label={t('admin.equipmentDetail.duplicate.codeLabel')} value={code} onChange={(e) => setCode(e.target.value)}
        placeholder={`${sourceCode}-COPY`}
        hint={count > 1
          ? t('admin.equipmentDetail.duplicate.hintMany')
          : t('admin.equipmentDetail.duplicate.hintOne')}
      />
      <TextField
        label={t('admin.equipmentDetail.duplicate.countLabel')} type="number" min={1} max={50} value={count}
        onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
      />
      <p className="sheet__note sheet__note--quiet">
        {t('admin.equipmentDetail.duplicate.firstDue', { date: longDate(today) })}
      </p>
    </Sheet>
  );
}
