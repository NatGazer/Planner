import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useResource, useRefreshOnFocus } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { useTheme } from '@ui/lib/theme';
import { useDebounced, usePrefersReducedMotion } from '@ui/anim/hooks';
import { Icon, type IconName } from '@ui/components/Icon';
import { Button } from '@ui/components/Button';
import { EmptyState, ErrorState, Skeleton } from '@ui/components/states';
import { groupByUrgency, accentClass, STATUS } from '@ui/lib/status';
import { initials, plural, shortDate } from '@ui/lib/format';
import { spring } from '@ui/anim/motion';
import type { Task } from '@ui/lib/types';
import { workerApi } from '../data';

/**
 * The shared list. Everybody sees exactly the same thing, in the same order,
 * with nothing assigned to anybody — whoever gets there first does the work.
 *
 * Overdue sits at the top because it is simply an earlier date, and the
 * sections are labelled so a glance is enough.
 */
export function TaskList() {
  const { navigate } = useRouter();
  const { employee, today, signOut } = useSession();
  const { resolved, toggle } = useTheme();
  const reduced = usePrefersReducedMotion();

  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [showLater, setShowLater] = useState(false);
  const debounced = useDebounced(search, 250);

  const list = useResource(() => workerApi.tasks(debounced || undefined), [debounced]);
  useRefreshOnFocus(list.reload);
  useSignOutOn401(list.error, signOut);

  const groups = useMemo(() => groupByUrgency(list.data?.tasks ?? []), [list.data]);
  const counts = list.data?.counts;
  const actionable = (counts?.overdue ?? 0) + (counts?.today ?? 0);

  /* --------------------------------------------------- pull to refresh --- */
  const pull = useMotionValue(0);
  const pullOpacity = useTransform(pull, [0, 40, 80], [0, 0.6, 1]);
  const pullRotate = useTransform(pull, [0, 90], [0, 320]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onDragEnd = useCallback(async () => {
    if (pull.get() > 72) {
      setRefreshing(true);
      await list.reload();
      setRefreshing(false);
    }
    pull.set(0);
  }, [pull, list]);

  return (
    <div className="w-list">
      <header className="w-head">
        <div className="w-head__row">
          <div>
            <p className="w-head__eyebrow">{greeting()}, {employee?.name?.split(' ')[0]}</p>
            <h1 className="w-head__title">
              {counts == null ? 'Loading…'
                : actionable === 0 ? 'Nothing due yet'
                  : `${actionable} to do`}
            </h1>
          </div>
          <div className="w-head__actions">
            <button type="button" className="w-icon-btn" onClick={() => setSearching((v) => !v)} aria-label="Search">
              <Icon name={searching ? 'close' : 'search'} size={19} />
            </button>
            <button type="button" className="w-icon-btn" onClick={toggle} aria-label="Switch appearance">
              <Icon name={resolved === 'dark' ? 'moon' : 'sun'} size={18} />
            </button>
            <button type="button" className="w-avatar" onClick={() => void signOut()} aria-label="Sign out" title="Sign out">
              {initials(employee?.name ?? '')}
            </button>
          </div>
        </div>

        {counts ? (
          <div className="w-pills">
            <Pill tone="overdue" label="Overdue" value={counts.overdue} />
            <Pill tone="today" label="Today" value={counts.today} />
            <Pill tone="soon" label="This week" value={counts.soon} />
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
                placeholder="Asset code, name or location" aria-label="Search tasks"
              />
              {search ? <button type="button" onClick={() => setSearch('')} aria-label="Clear"><Icon name="close" size={14} /></button> : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      <motion.div
        className="w-pull"
        style={{ opacity: pullOpacity }}
        aria-hidden="true"
      >
        <motion.span style={{ rotate: pullRotate }} className={refreshing ? 'is-spinning' : undefined}>
          <Icon name="refresh" size={18} />
        </motion.span>
      </motion.div>

      <motion.div
        ref={scrollRef}
        className="w-scroll"
        drag={reduced ? false : 'y'}
        dragDirectionLock
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.42, bottom: 0 }}
        style={{ y: pull }}
        onDragEnd={onDragEnd}
      >
        {list.error && !list.data ? (
          <ErrorState message={list.error.message} onRetry={() => void list.reload()} />
        ) : !list.data ? (
          <div className="w-cards">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={104} radius={20} />)}</div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={debounced ? 'search' : 'checkCircle'}
            tone={debounced ? 'calm' : 'good'}
            title={debounced ? 'Nothing matches' : 'All clear'}
            body={debounced
              ? 'Try a different asset code or location.'
              : 'Every scheduled job has been done. New ones appear here as they fall due.'}
            action={debounced ? <Button variant="secondary" onClick={() => { setSearch(''); setSearching(false); }}>Clear search</Button> : undefined}
          />
        ) : (
          groups.map((group) => {
            const collapsed = group.bucket === 'later' && !showLater;
            return (
              <section key={group.bucket} className={`w-group ${group.style.className}`}>
                <header className="w-group__head">
                  <span className="w-group__dot" aria-hidden="true" />
                  <h2>{group.style.label}</h2>
                  <span className="w-group__count">{group.tasks.length}</span>
                  {group.bucket === 'later' ? (
                    <button type="button" className="w-group__toggle" onClick={() => setShowLater((v) => !v)}>
                      {collapsed ? 'Show' : 'Hide'}
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

        {list.data ? (
          <p className="w-foot">
            {plural(list.data.counts.total, 'job')} outstanding · times shown in {list.data.timezone.replace('_', ' ')}
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Evening';
  if (h < 12) return 'Morning';
  if (h < 18) return 'Afternoon';
  return 'Evening';
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
  const reduced = usePrefersReducedMotion();
  const s = STATUS[task.due.bucket];
  return (
    <motion.button
      type="button"
      layout
      className={`w-card ${s.className} ${accentClass(task.equipment.type?.accent ?? 'aurora')}`}
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
            {task.due.label}
          </span>
        </span>
        <span className="w-card__title">{task.rule.title}</span>
        <span className="w-card__meta">
          <span className="w-card__equipment">
            {task.equipment.type ? <Icon name={task.equipment.type.icon as IconName} size={13} /> : null}
            {task.equipment.name}
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
