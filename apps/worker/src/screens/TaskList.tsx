import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useTransform } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useResource, useRefreshOnFocus } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { useDebounced, usePrefersReducedMotion } from '@ui/anim/hooks';
import { usePullToRefresh } from '@ui/anim/usePullToRefresh';
import { Icon, type IconName } from '@ui/components/Icon';
import { Button } from '@ui/components/Button';
import { EmptyState, ErrorState, Skeleton } from '@ui/components/states';
import { groupByUrgency, accentClass, STATUS, dueLabel } from '@ui/lib/status';
import { errorMessage } from '@ui/lib/errors';
import { useT, type StringKey } from '@ui/lib/i18n';
import { initials, shortDate } from '@ui/lib/format';
import { spring } from '@ui/anim/motion';
import type { Task } from '@ui/lib/types';
import { workerApi } from '../data';
import { AccountSheet } from '../components/AccountSheet';

/**
 * The shared list. Everybody sees exactly the same thing, in the same order,
 * with nothing assigned to anybody — whoever gets there first does the work.
 *
 * Overdue sits at the top because it is simply an earlier date, and the
 * sections are labelled so a glance is enough.
 */
export function TaskList() {
  const t = useT();
  const { navigate } = useRouter();
  const { employee, today, signOut } = useSession();
  const reduced = usePrefersReducedMotion();

  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [showLater, setShowLater] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const debounced = useDebounced(search, 250);

  const list = useResource(() => workerApi.tasks(debounced || undefined), [debounced]);
  useRefreshOnFocus(list.reload);
  useSignOutOn401(list.error, signOut);

  const groups = useMemo(() => groupByUrgency(list.data?.tasks ?? []), [list.data]);
  const counts = list.data?.counts;
  const actionable = (counts?.overdue ?? 0) + (counts?.today ?? 0);

  /* --------------------------------------------------- pull to refresh --- */
  const { ref: scrollRef, pull } = usePullToRefresh(() => list.reload());
  const pullOpacity = useTransform(pull, [0, 34, 72], [0, 0.55, 1]);
  const pullRotate = useTransform(pull, [0, 96], [-120, 0]);
  const pullShift = useTransform(pull, [0, 140], [0, 70]);

  return (
    <div className="w-list">
      <header className="w-head">
        <div className="w-head__row">
          <div>
            <p className="w-head__eyebrow">{t(greetingKey(), { name: employee?.name?.split(' ')[0] ?? '' })}</p>
            <h1 className="w-head__title">
              {counts == null ? t('common.loading')
                : actionable === 0 ? t('worker.list.title.clear')
                  : t('worker.list.title.toDo', { count: actionable })}
            </h1>
          </div>
          <div className="w-head__actions">
            <button type="button" className="w-icon-btn" onClick={() => setSearching((v) => !v)} aria-label={t('common.search')}>
              <Icon name={searching ? 'close' : 'search'} size={19} />
            </button>
            <button
              type="button"
              className="w-icon-btn"
              onClick={() => void list.reload()}
              disabled={list.refreshing}
              aria-label={t('worker.list.refresh')}
            >
              <Icon name="refresh" size={18} className={list.refreshing ? 'is-spinning' : undefined} />
            </button>
            <button
              type="button"
              className="w-avatar"
              onClick={() => setAccountOpen(true)}
              aria-label={t('worker.account.open')}
              title={t('worker.account.open')}
            >
              {initials(employee?.name ?? '')}
            </button>
          </div>
        </div>

        {counts ? (
          <div className="w-pills">
            <Pill tone="overdue" label={t('status.overdue.short')} value={counts.overdue} />
            <Pill tone="today" label={t('status.today.short')} value={counts.today} />
            <Pill tone="soon" label={t('status.soon.short')} value={counts.soon} />
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {searching ? (
            <motion.div
              className="w-search"
              initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0, y: -8 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0, y: -6 }}
              transition={spring.snap}
            >
              <Icon name="search" size={16} />
              <input
                autoFocus type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t('worker.list.searchPlaceholder')} aria-label={t('worker.list.searchLabel')}
              />
              {search ? <button type="button" onClick={() => setSearch('')} aria-label={t('common.clear')}><Icon name="close" size={14} /></button> : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      <motion.div
        className="w-pull"
        style={{ opacity: pullOpacity }}
        aria-hidden="true"
      >
        <motion.span style={{ rotate: pullRotate }} className={list.refreshing ? 'is-spinning' : undefined}>
          <Icon name="refresh" size={18} />
        </motion.span>
      </motion.div>

      <motion.div ref={scrollRef} className="w-scroll" style={{ y: pullShift }}>
        {list.error && !list.data ? (
          <ErrorState message={errorMessage(t, list.error)} onRetry={() => void list.reload()} />
        ) : !list.data ? (
          <div className="w-cards">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={104} radius={20} />)}</div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={debounced ? 'search' : 'checkCircle'}
            tone={debounced ? 'calm' : 'good'}
            title={debounced ? t('worker.list.empty.noMatchTitle') : t('worker.list.empty.clearTitle')}
            body={debounced
              ? t('worker.list.empty.noMatchBody')
              : t('worker.list.empty.clearBody')}
            action={debounced ? <Button variant="secondary" onClick={() => { setSearch(''); setSearching(false); }}>{t('worker.list.clearSearch')}</Button> : undefined}
          />
        ) : (
          groups.map((group) => {
            // Nothing pressing? Then the `later` section is the whole list, and
            // collapsing it would leave the worker staring at an empty screen.
            const collapsed = group.bucket === 'later' && !showLater && groups.length > 1;
            return (
              <section key={group.bucket} className={`w-group ${group.style.className}`}>
                <header className="w-group__head">
                  <span className="w-group__dot" aria-hidden="true" />
                  <h2>{t(group.style.labelKey)}</h2>
                  <span className="w-group__count">{group.tasks.length}</span>
                  {group.bucket === 'later' ? (
                    <button type="button" className="w-group__toggle" onClick={() => setShowLater((v) => !v)}>
                      {collapsed ? t('worker.list.show') : t('worker.list.hide')}
                      <Icon name="chevronDown" size={14} className={collapsed ? '' : 'is-flipped'} />
                    </button>
                  ) : null}
                </header>
                <AnimatePresence initial={false}>
                  {!collapsed ? (
                    <motion.div
                      className="w-cards"
                      initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      transition={{ duration: 0.24 }}
                    >
                      {group.tasks.map((task, i) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          today={today}
                          index={i}
                          onOpen={() => navigate(`/task/${task.id}`)}
                        />
                      ))}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </section>
            );
          })
        )}

        {list.data?.truncated ? (
          <p className="w-truncated">
            {t('worker.list.truncated', { shown: list.data.tasks.length, count: list.data.counts.total })}
          </p>
        ) : null}

        {list.data ? (
          <p className="w-foot">
            {t('worker.list.footer', { count: list.data.counts.total, zone: list.data.timezone.replace('_', ' ') })}
          </p>
        ) : null}
      </motion.div>

      <AccountSheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        name={employee?.name ?? ''}
        email={employee?.email ?? ''}
        onSignOut={() => { setAccountOpen(false); void signOut(); }}
      />
    </div>
  );
}

/** Which greeting fits the hour; the sentence itself lives in the dictionary. */
function greetingKey(): StringKey {
  const h = new Date().getHours();
  if (h < 5) return 'worker.list.greeting.evening';
  if (h < 12) return 'worker.list.greeting.morning';
  if (h < 18) return 'worker.list.greeting.afternoon';
  return 'worker.list.greeting.evening';
}

function Pill({ tone, label, value }: { tone: string; label: string; value: number }) {
  return (
    <span className={`w-pill w-pill--${tone}${value ? '' : ' is-empty'}`}>
      <span className="w-pill__value">{value}</span>
      <span className="w-pill__label">{label}</span>
    </span>
  );
}

/**
 * One job, sized so a gloved thumb can hit it without aiming: the whole card
 * is the target, the equipment code is the biggest thing on it, and the
 * urgency reads as colour before you have read a word.
 */
function TaskCard({ task, today, index, onOpen }: { task: Task; today: string; index: number; onOpen: () => void }) {
  const t = useT();
  const reduced = usePrefersReducedMotion();
  const s = STATUS[task.due.bucket];
  // The pressure field: full width when the job is due or late, shrinking
  // away over the following month. It is read before any of the words are.
  const pressure = Math.max(0.06, Math.min(1, 1 - task.due.days / 30));
  return (
    /* Deliberately not a `layout` animation: this list is the most
       performance-sensitive surface in either app, and `layout` measures every
       card on every render. The entrance variant carries the movement. */
    <motion.button
      type="button"
      className={`w-card ${s.className} ${accentClass(task.equipment.type?.accent ?? 'aurora')}`}
      style={{ '--pressure': pressure } as React.CSSProperties}
      onClick={onOpen}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.97, rotateX: -6 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: -60, scale: 0.94 }}
      transition={{ ...spring.glide, delay: Math.min(index * 0.035, 0.3) }}
      whileTap={reduced ? undefined : { scale: 0.972 }}
    >
      <span className="w-card__edge" aria-hidden="true" />
      <span className="w-card__body">
        <span className="w-card__top">
          <span className="w-card__code">{task.equipment.code}</span>
          <span className={`w-card__due ${s.className}`}>
            <Icon name={s.icon} size={12} />
            {dueLabel(t, task.due)}
          </span>
        </span>
        <span className="w-card__title">{task.rule.title}</span>
        <span className="w-card__meta">
          <span className="w-card__equipment">
            {task.equipment.type ? <Icon name={task.equipment.type.icon as IconName} size={13} /> : null}
            <span>{task.equipment.name}</span>
          </span>
          {task.equipment.location ? (
            <span className="w-card__location"><Icon name="pin" size={12} /> {task.equipment.location}</span>
          ) : null}
        </span>
      </span>
      <span className="w-card__go">
        <span className="w-card__date">{shortDate(task.dueDate, today)}</span>
        <Icon name="chevronRight" size={18} />
      </span>
    </motion.button>
  );
}
