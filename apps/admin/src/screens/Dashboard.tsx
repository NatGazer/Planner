import { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useResource, useRefreshOnFocus } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { Icon } from '@ui/components/Icon';
import { Bars, Ring, Sparkline, Stack } from '@ui/components/charts';
import { EmptyState, ErrorState, Skeleton } from '@ui/components/states';
import { Button } from '@ui/components/Button';
import { useCountUp, usePrefersReducedMotion } from '@ui/anim/hooks';
import { listContainer, riseIn, stillContainer } from '@ui/anim/motion';
import { accentClass, urgencySummary } from '@ui/lib/status';
import { plural, shortDate, weekday } from '@ui/lib/format';
import type { IconName } from '@ui/components/Icon';
import { adminApi } from '../data';
import { CompletionRow, Panel, StatTile, TaskRow } from '../components/primitives';

/**
 * The main screen: everything an administrator needs to know, and a door out
 * of every number on it. Nothing here is decorative-only — every card opens
 * the list it is counting.
 */
export function Dashboard() {
  const { navigate } = useRouter();
  const { signOut } = useSession();
  const reduced = usePrefersReducedMotion();
  const dash = useResource(() => adminApi.dashboard(), []);
  useRefreshOnFocus(dash.reload);
  useSignOutOn401(dash.error, signOut);

  const go = useCallback((to: string) => () => navigate(to), [navigate]);
  const data = dash.data;

  const trendValues = useMemo(() => data?.completionTrend.map((d) => d.count) ?? [], [data]);
  const loadBars = useMemo(() => (data?.upcomingLoad ?? []).map((d, i) => ({
    label: d.date,
    value: d.count,
    carried: d.carried,
    emphasis: i === 0 && d.carried > 0,
    title: i === 0 && d.carried
      ? `${shortDate(d.date, data?.today)}: ${d.count} due, including ${d.carried} overdue`
      : `${weekday(d.date)} ${shortDate(d.date, data?.today)}: ${plural(d.count, 'task')}`,
  })), [data]);

  if (dash.error && !data) {
    return <div className="page page--wide"><ErrorState message={dash.error.message} onRetry={() => void dash.reload()} /></div>;
  }

  if (!data) {
    return (
      <div className="page page--wide">
        <div className="page__head"><Skeleton width={280} height={30} /></div>
        <div className="grid">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={132} radius={20} style={{ gridColumn: 'span 3' }} />)}
          <Skeleton height={300} radius={22} style={{ gridColumn: 'span 8' }} />
          <Skeleton height={300} radius={22} style={{ gridColumn: 'span 4' }} />
        </div>
      </div>
    );
  }

  const s = data.stats;
  const pressure = s.overdue + s.dueToday;

  return (
    <div className="page page--wide">
      <motion.header
        className="page__head"
        variants={reduced ? stillContainer : listContainer(3)}
        initial="hidden"
        animate="shown"
      >
        <motion.div variants={riseIn}>
          <h1 className="page__title">Overview</h1>
          <p className="page__lede">
            {urgencySummary({ overdue: s.overdue, today: s.dueToday, soon: s.dueThisWeek })}
            {' · '}
            <span className="page__lede-quiet">{plural(s.activeEquipment, 'active item')} across {plural(s.equipmentTypes, 'type')}</span>
          </p>
        </motion.div>
        <motion.div className="page__head-actions" variants={riseIn}>
          <button type="button" className="ghost-link" onClick={() => void dash.reload()} disabled={dash.refreshing}>
            <Icon name="refresh" size={14} className={dash.refreshing ? 'is-spinning' : undefined} />
            {dash.refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </motion.div>
      </motion.header>

      <motion.div
        className="grid stage"
        variants={reduced ? stillContainer : listContainer(10, 0.06)}
        initial="hidden"
        animate="shown"
      >
        {/* ------------------------------------------------- the four numbers */}
        <div className="grid__tiles">
          <StatTile
            index={0}
            label="Active equipment"
            value={s.activeEquipment}
            caption={s.inactiveEquipment
              ? <>{plural(s.inactiveEquipment, 'item')} deactivated</>
              : <>All items in service</>}
            icon="equipment"
            tone="neutral"
            onOpen={go('/equipment')}
          />
          <StatTile
            index={1}
            label="Overdue"
            value={s.overdue}
            caption={s.overdue ? <>Oldest {data.attention[0] ? data.attention[0].due.label.replace(' overdue', '') : ''} past due</> : <>Nothing is late</>}
            icon="alert"
            tone="overdue"
            onOpen={go('/tasks?bucket=overdue')}
          />
          <StatTile
            index={2}
            label="Due today"
            value={s.dueToday}
            caption={s.dueToday ? <>Scheduled for {shortDate(data.today)}</> : <>Nothing scheduled today</>}
            icon="clock"
            tone="today"
            onOpen={go('/tasks?bucket=today')}
          />
          <StatTile
            index={3}
            label="Next seven days"
            value={s.dueThisWeek}
            caption={<>{plural(s.outstanding, 'task')} outstanding in total</>}
            icon="calendar"
            tone="soon"
            onOpen={go('/tasks?bucket=week')}
          />
        </div>

        {/* -------------------------------------------------- workload chart */}
        <Panel
          title="The fortnight ahead"
          subtitle={pressure
            ? `${plural(pressure, 'task')} ${pressure === 1 ? 'needs' : 'need'} attention today or sooner`
            : 'Nothing is late — the schedule is clear'}
          icon="trend"
          span={8}
          onOpen={go('/tasks')}
          openLabel="Open the task list"
        >
          {s.outstanding === 0 ? (
            <EmptyState
              icon={s.totalEquipment ? 'checkCircle' : 'sparkle'}
              tone={s.totalEquipment ? 'good' : 'calm'}
              title={s.totalEquipment ? 'Nothing is scheduled' : 'Nothing set up yet'}
              body={s.totalEquipment
                ? 'Every item is either deactivated or has no active maintenance task. Add one and a schedule opens here.'
                : 'Start with an equipment type, give it the maintenance it needs, then add the physical items. Each one gets its own schedule.'}
              action={<Button variant="primary" icon="plus" onClick={go(s.totalEquipment ? '/rules' : '/types')}>
                {s.totalEquipment ? 'Add a maintenance task' : 'Create the first type'}
              </Button>}
            />
          ) : (
          <div className="workload">
            <div className="workload__scale">
              <span>Tasks falling due each day</span>
              <span><span className="workload__peak">{Math.max(...(data.upcomingLoad.map((d) => d.count)), 0)}</span> at the peak</span>
            </div>
            <Bars values={loadBars} height={168} delay={0.24} onSelect={(i) => {
              const date = data.upcomingLoad[i];
              navigate(i === 0 ? '/tasks?bucket=due-or-overdue' : `/tasks?bucket=week&on=${date.date}`);
            }} />
            <div className="workload__axis">
              {data.upcomingLoad.map((d, i) => (
                <span key={d.date} className={`workload__tick${i === 0 ? ' is-now' : ''}`}>
                  {i === 0 ? 'Today' : i % 2 === 0 ? weekday(d.date)[0] : ''}
                </span>
              ))}
            </div>
            <Stack
              className="workload__stack"
              segments={[
                { key: 'overdue', value: s.overdue, color: 'var(--status-overdue)', label: 'Overdue' },
                { key: 'today', value: s.dueToday, color: 'var(--status-today)', label: 'Due today' },
                { key: 'soon', value: s.dueThisWeek, color: 'var(--status-soon)', label: 'This week' },
                { key: 'later', value: s.later, color: 'var(--status-later)', label: 'Later' },
              ]}
            />
            <div className="workload__legend">
              <LegendDot tone="overdue" label="Overdue" value={s.overdue} />
              <LegendDot tone="today" label="Due today" value={s.dueToday} />
              <LegendDot tone="soon" label="This week" value={s.dueThisWeek} />
              <LegendDot tone="later" label="Later" value={s.later} />
            </div>
          </div>
          )}
        </Panel>

        {/* ------------------------------------------------------ on-time rate */}
        <Panel
          title="On-time rate"
          subtitle="Completed by the due date, last thirty days"
          icon="checkCircle"
          span={4}
          onOpen={go('/history')}
          openLabel="See history"
        >
          <div className="ontime">
            <Ring value={(s.onTimeRate30d ?? 0) / 100} size={128} thickness={11} className="ontime__ring">
              <span className="ontime__figure">
                <RateNumber value={s.onTimeRate30d} />
              </span>
            </Ring>
            <div className="ontime__facts">
              <p className="ontime__fact">
                <strong>{s.onTime30d}</strong> of {plural(s.completions30d, 'completion')} met their due date
              </p>
              <p className="ontime__fact ontime__fact--quiet">
                {plural(s.completionsAllTime, 'completion')} recorded in total
              </p>
              {trendValues.length ? (
                <div className="ontime__spark">
                  <Sparkline values={trendValues} width={200} height={40} delay={0.4} />
                  <span className="ontime__spark-label">28-day activity</span>
                </div>
              ) : null}
            </div>
          </div>
        </Panel>

        {/* -------------------------------------------------- needs attention */}
        <Panel
          title="Needs attention"
          subtitle={s.overdue ? `${plural(s.overdue, 'task')} past due` : 'Nothing is overdue'}
          icon="alert"
          span={6}
          onOpen={s.overdue ? go('/tasks?bucket=overdue') : undefined}
          openLabel="See all overdue"
        >
          {data.attention.length ? (
            <motion.div className="stack-list" variants={reduced ? stillContainer : listContainer(data.attention.length)} initial="hidden" animate="shown">
              {data.attention.slice(0, 4).map((task) => (
                <TaskRow key={task.id} task={task} today={data.today} dense onOpen={() => navigate(`/equipment/${task.equipment.id}`)} />
              ))}
            </motion.div>
          ) : (
            <EmptyState
              icon="checkCircle"
              tone="good"
              title="Everything is up to date"
              body="No maintenance is past its due date. The next items are scheduled below."
            />
          )}
        </Panel>

        {/* ------------------------------------------------ recent completions */}
        <Panel
          title="Recently completed"
          subtitle="Submitted from the worker app"
          icon="history"
          span={6}
          onOpen={go('/history')}
          openLabel="Full history"
        >
          {data.recentCompletions.length ? (
            <motion.div className="stack-list" variants={reduced ? stillContainer : listContainer(data.recentCompletions.length)} initial="hidden" animate="shown">
              {data.recentCompletions.slice(0, 4).map((c) => (
                <CompletionRow key={c.id} completion={c} onOpen={() => navigate(`/history?completion=${c.id}`)} />
              ))}
            </motion.div>
          ) : (
            <EmptyState icon="camera" title="No completions yet" body="Work submitted by the team will appear here, photo and all." />
          )}
        </Panel>

        {/* ------------------------------------------------------------ types */}
        <Panel
          title="Equipment types"
          subtitle={`${plural(s.equipmentTypes, 'type')} · ${plural(s.activeRules, 'active maintenance task')}`}
          icon="types"
          span={5}
          onOpen={go('/types')}
          openLabel="Manage types"
        >
          <motion.div className="type-grid" variants={reduced ? stillContainer : listContainer(data.byType.length)} initial="hidden" animate="shown">
            {data.byType.map((t) => (
              <motion.button
                key={t.id}
                type="button"
                variants={riseIn}
                className={`type-cell ${accentClass(t.accent)}${t.overdue ? ' has-overdue' : ''}`}
                onClick={() => navigate(`/equipment?type=${t.id}`)}
              >
                <span className="type-cell__icon"><Icon name={t.icon as IconName} size={18} /></span>
                <span className="type-cell__name">{t.name}</span>
                <span className="type-cell__count">{t.equipmentCount}</span>
                {t.overdue ? <span className="type-cell__overdue">{t.overdue} overdue</span> : null}
              </motion.button>
            ))}
          </motion.div>
        </Panel>

        {/* ----------------------------------------------------------- next up */}
        <Panel
          title="Coming up"
          subtitle="The next scheduled work"
          icon="calendar"
          span={7}
          onOpen={go('/tasks')}
          openLabel="See the schedule"
        >
          {data.nextUp.length ? (
            <motion.div className="stack-list" variants={reduced ? stillContainer : listContainer(data.nextUp.length)} initial="hidden" animate="shown">
              {data.nextUp.slice(0, 6).map((task) => (
                <TaskRow key={task.id} task={task} today={data.today} dense onOpen={() => navigate(`/equipment/${task.equipment.id}`)} />
              ))}
            </motion.div>
          ) : (
            <EmptyState icon="sparkle" title="Nothing scheduled" body="Add equipment or a maintenance task to start a schedule." />
          )}
        </Panel>

        {s.hiddenPending ? (
          <motion.aside variants={riseIn} className="note-strip" style={{ gridColumn: 'span 12' }}>
            <Icon name="info" size={15} />
            <p>
              <strong>{plural(s.hiddenPending, 'pending task')}</strong> are hidden because their equipment or maintenance
              task is deactivated. They keep their due dates and reappear the moment you reactivate.
            </p>
            <button type="button" className="ghost-link" onClick={go('/tasks?hidden=1')}>Show them</button>
          </motion.aside>
        ) : null}
      </motion.div>
    </div>
  );
}

function LegendDot({ tone, label, value }: { tone: string; label: string; value: number }) {
  return (
    <span className={`legend legend--${tone}`}>
      <span className="legend__dot" aria-hidden="true" />
      <span className="legend__label">{label}</span>
      <span className="legend__value">{value}</span>
    </span>
  );
}

function RateNumber({ value }: { value: number | null }) {
  const ref = useCountUp(value ?? 0, { delay: 0.35 });
  if (value === null) return <span className="ontime__none">—</span>;
  return (
    <>
      <span ref={ref}>0</span>
      <span className="ontime__pct">%</span>
    </>
  );
}
