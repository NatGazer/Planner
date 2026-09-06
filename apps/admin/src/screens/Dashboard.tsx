import { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useResource, useRefreshOnFocus } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { Icon } from '@ui/components/Icon';
import { Bars, Ring, Sparkline, Stack } from '@ui/components/charts';
import { EmptyState, ErrorState, Skeleton } from '@ui/components/states';
import { Button } from '@ui/components/Button';
import { useCountUp, usePrefersReducedMotion, useMediaQuery } from '@ui/anim/hooks';
import { listContainer, riseIn, stillContainer } from '@ui/anim/motion';
import { accentClass, urgencySummary } from '@ui/lib/status';
import { errorMessage } from '@ui/lib/errors';
import { useT } from '@ui/lib/i18n';
import { shortDate, weekday, weekdayNarrow } from '@ui/lib/format';
import type { IconName } from '@ui/components/Icon';
import { adminApi } from '../data';
import { CompletionRow, Panel, StatTile, TaskRow } from '../components/primitives';

/**
 * The main screen: everything an administrator needs to know, and a door out
 * of every number on it. Nothing here is decorative-only — every card opens
 * the list it is counting.
 */
export function Dashboard() {
  const t = useT();
  // Fourteen axis columns on a phone leave 25px each: not a word, in any language.
  const narrow = useMediaQuery('(max-width: 600px)');
  const { navigate } = useRouter();
  const { signOut } = useSession();
  const reduced = usePrefersReducedMotion();
  const dash = useResource(() => adminApi.dashboard(), []);
  useRefreshOnFocus(dash.reload);
  useSignOutOn401(dash.error, signOut);

  const go = useCallback((to: string) => () => navigate(to), [navigate]);
  const data = dash.data;

  const trendValues = useMemo(() => data?.completionTrend.map((d) => d.count) ?? [], [data]);
  // `t` is a dependency like any other: the tooltips are sentences, and they
  // have to be rebuilt when the reader changes language.
  const loadBars = useMemo(() => (data?.upcomingLoad ?? []).map((d, i) => ({
    label: d.date,
    value: d.count,
    carried: d.carried,
    emphasis: i === 0 && d.carried > 0,
    title: i === 0 && d.carried
      ? t('admin.dashboard.load.tipCarried', { date: shortDate(d.date, data?.today), count: d.count, carried: d.carried })
      : t('admin.dashboard.load.tip', { weekday: weekday(d.date), date: shortDate(d.date, data?.today), count: d.count }),
  })), [data, t]);

  if (dash.error && !data) {
    return <div className="page page--wide"><ErrorState message={errorMessage(t, dash.error)} onRetry={() => void dash.reload()} /></div>;
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
  const oldest = data.attention[0];

  return (
    <div className="page page--wide">
      <motion.header
        className="page__head"
        variants={reduced ? stillContainer : listContainer(3)}
        initial="hidden"
        animate="shown"
      >
        <motion.div variants={riseIn}>
          <h1 className="page__title">{t('admin.dashboard.title')}</h1>
          <p className="page__lede">
            {urgencySummary(t, { overdue: s.overdue, today: s.dueToday, soon: s.dueThisWeek })}
            {' · '}
            <span className="page__lede-quiet">
              {t('admin.dashboard.lede.estate', {
                count: s.activeEquipment,
                types: t('admin.dashboard.lede.types', { count: s.equipmentTypes }),
              })}
            </span>
          </p>
        </motion.div>
        <motion.div className="page__head-actions" variants={riseIn}>
          <button type="button" className="ghost-link" onClick={() => void dash.reload()} disabled={dash.refreshing}>
            <Icon name="refresh" size={14} className={dash.refreshing ? 'is-spinning' : undefined} />
            {dash.refreshing ? t('admin.dashboard.refreshing') : t('admin.dashboard.refresh')}
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
            label={t('admin.dashboard.tile.equipment.label')}
            value={s.activeEquipment}
            caption={s.inactiveEquipment
              ? t('admin.dashboard.tile.equipment.deactivated', { count: s.inactiveEquipment })
              : t('admin.dashboard.tile.equipment.allActive')}
            icon="equipment"
            tone="neutral"
            onOpen={go('/equipment')}
          />
          <StatTile
            index={1}
            label={t('status.overdue')}
            value={s.overdue}
            caption={s.overdue
              ? (oldest ? t('admin.dashboard.tile.overdue.oldest', { count: Math.abs(oldest.due.days) }) : '')
              : t('admin.dashboard.tile.overdue.none')}
            icon="alert"
            tone="overdue"
            onOpen={go('/tasks?bucket=overdue')}
          />
          <StatTile
            index={2}
            label={t('status.today')}
            value={s.dueToday}
            caption={s.dueToday
              ? t('admin.dashboard.tile.today.scheduled', { date: shortDate(data.today) })
              : t('admin.dashboard.tile.today.none')}
            icon="clock"
            tone="today"
            onOpen={go('/tasks?bucket=today')}
          />
          <StatTile
            index={3}
            label={t('admin.dashboard.tile.week.label')}
            value={s.dueThisWeek}
            caption={t('admin.dashboard.tile.week.outstanding', { count: s.outstanding })}
            icon="calendar"
            tone="soon"
            onOpen={go('/tasks?bucket=week')}
          />
        </div>

        {/* -------------------------------------------------- workload chart */}
        <Panel
          title={t('admin.dashboard.load.title')}
          subtitle={pressure
            ? t('admin.dashboard.load.pressure', { count: pressure })
            : t('admin.dashboard.load.clear')}
          icon="trend"
          span={8}
          onOpen={go('/tasks')}
          openLabel={t('admin.dashboard.load.open')}
        >
          {s.outstanding === 0 ? (
            <EmptyState
              icon={s.totalEquipment ? 'checkCircle' : 'sparkle'}
              tone={s.totalEquipment ? 'good' : 'calm'}
              title={s.totalEquipment ? t('admin.dashboard.load.empty.title') : t('admin.dashboard.setup.title')}
              body={s.totalEquipment
                ? t('admin.dashboard.load.empty.body')
                : t('admin.dashboard.setup.body')}
              action={<Button variant="primary" icon="plus" onClick={go(s.totalEquipment ? '/rules' : '/types')}>
                {s.totalEquipment ? t('admin.dashboard.load.empty.action') : t('admin.dashboard.setup.action')}
              </Button>}
            />
          ) : (
          <div className="workload">
            <div className="workload__scale">
              <span>{t('admin.dashboard.load.scale')}</span>
              {/* One sentence, one key: the emphasis moves to the whole phrase
                  rather than wrapping a number that sits elsewhere in a
                  translated word order. */}
              <span className="workload__peak">
                {t('admin.dashboard.load.peak', { count: Math.max(...(data.upcomingLoad.map((d) => d.count)), 0) })}
              </span>
            </div>
            <Bars values={loadBars} height={168} delay={0.24} onSelect={(i) => {
              // Day zero carries the backlog as well as today's own work, so it
              // opens everything due or overdue; any other column opens exactly
              // the day it represents.
              const day = data.upcomingLoad[i];
              navigate(i === 0 ? '/tasks?bucket=due-or-overdue' : `/tasks?on=${day.date}`);
            }} />
            <div className="workload__axis">
              {data.upcomingLoad.map((d, i) => (
                <span
                  key={d.date}
                  className={`workload__tick${i === 0 ? ' is-now' : ''}`}
                  aria-label={i === 0 ? t('admin.dashboard.load.axisToday') : undefined}
                >
                  {i === 0 && !narrow ? t('admin.dashboard.load.axisToday')
                    : i === 0 || i % 2 === 0 ? weekdayNarrow(d.date) : ''}
                </span>
              ))}
            </div>
            <Stack
              className="workload__stack"
              segments={[
                { key: 'overdue', value: s.overdue, color: 'var(--status-overdue)', label: t('status.overdue') },
                { key: 'today', value: s.dueToday, color: 'var(--status-today)', label: t('status.today') },
                { key: 'soon', value: s.dueThisWeek, color: 'var(--status-soon)', label: t('status.soon.short') },
                { key: 'later', value: s.later, color: 'var(--status-later)', label: t('status.later.short') },
              ]}
            />
            <div className="workload__legend">
              <LegendDot tone="overdue" label={t('status.overdue')} value={s.overdue} />
              <LegendDot tone="today" label={t('status.today')} value={s.dueToday} />
              <LegendDot tone="soon" label={t('status.soon.short')} value={s.dueThisWeek} />
              <LegendDot tone="later" label={t('status.later.short')} value={s.later} />
            </div>
          </div>
          )}
        </Panel>

        {/* ------------------------------------------------------ on-time rate */}
        <Panel
          title={t('admin.dashboard.ontime.title')}
          subtitle={t('admin.dashboard.ontime.subtitle')}
          icon="checkCircle"
          span={4}
          onOpen={go('/history')}
          openLabel={t('admin.dashboard.ontime.open')}
        >
          <div className="ontime">
            <Ring value={(s.onTimeRate30d ?? 0) / 100} size={128} thickness={11} className="ontime__ring">
              <span className="ontime__figure">
                <RateNumber value={s.onTimeRate30d} />
              </span>
            </Ring>
            <div className="ontime__facts">
              <p className="ontime__fact">
                {t('admin.dashboard.ontime.met', { onTime: s.onTime30d, count: s.completions30d })}
              </p>
              <p className="ontime__fact ontime__fact--quiet">
                {t('admin.dashboard.ontime.total', { count: s.completionsAllTime })}
              </p>
              {trendValues.length ? (
                <div className="ontime__spark">
                  <Sparkline values={trendValues} width={200} height={40} delay={0.4} />
                  <span className="ontime__spark-label">{t('admin.dashboard.ontime.spark')}</span>
                </div>
              ) : null}
            </div>
          </div>
        </Panel>

        {/* -------------------------------------------------- needs attention */}
        <Panel
          title={t('admin.dashboard.attention.title')}
          subtitle={s.overdue
            ? t('admin.dashboard.attention.subtitle', { count: s.overdue })
            : t('admin.dashboard.attention.none')}
          icon="alert"
          span={6}
          onOpen={s.overdue ? go('/tasks?bucket=overdue') : undefined}
          openLabel={t('admin.dashboard.attention.open')}
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
              title={t('admin.dashboard.attention.empty.title')}
              body={t('admin.dashboard.attention.empty.body')}
            />
          )}
        </Panel>

        {/* ------------------------------------------------ recent completions */}
        <Panel
          title={t('admin.dashboard.recent.title')}
          subtitle={t('admin.dashboard.recent.subtitle')}
          icon="history"
          span={6}
          onOpen={go('/history')}
          openLabel={t('admin.dashboard.recent.open')}
        >
          {data.recentCompletions.length ? (
            <motion.div className="stack-list" variants={reduced ? stillContainer : listContainer(data.recentCompletions.length)} initial="hidden" animate="shown">
              {data.recentCompletions.slice(0, 4).map((c) => (
                <CompletionRow key={c.id} completion={c} onOpen={() => navigate(`/history?completion=${c.id}`)} />
              ))}
            </motion.div>
          ) : (
            <EmptyState icon="camera" title={t('admin.dashboard.recent.empty.title')} body={t('admin.dashboard.recent.empty.body')} />
          )}
        </Panel>

        {/* ------------------------------------------------------------ types */}
        <Panel
          title={t('admin.dashboard.types.title')}
          subtitle={t('admin.dashboard.types.subtitle', {
            count: s.equipmentTypes,
            tasks: t('admin.dashboard.types.tasks', { count: s.activeRules }),
          })}
          icon="types"
          span={5}
          onOpen={go('/types')}
          openLabel={t('admin.dashboard.types.open')}
        >
          <motion.div className="type-grid" variants={reduced ? stillContainer : listContainer(data.byType.length)} initial="hidden" animate="shown">
            {/* The row is `type`, not `t`: `t` is the translator here. */}
            {data.byType.map((type) => (
              <motion.button
                key={type.id}
                type="button"
                variants={riseIn}
                className={`type-cell ${accentClass(type.accent)}${type.overdue ? ' has-overdue' : ''}`}
                onClick={() => navigate(`/equipment?type=${type.id}`)}
              >
                <span className="type-cell__icon"><Icon name={type.icon as IconName} size={18} /></span>
                <span className="type-cell__name">{type.name}</span>
                <span className="type-cell__count">{type.equipmentCount}</span>
                {type.overdue ? <span className="type-cell__overdue">{t('urgency.overdue', { count: type.overdue })}</span> : null}
              </motion.button>
            ))}
          </motion.div>
        </Panel>

        {/* ----------------------------------------------------------- next up */}
        <Panel
          title={t('admin.dashboard.next.title')}
          subtitle={t('admin.dashboard.next.subtitle')}
          icon="calendar"
          span={7}
          onOpen={go('/tasks')}
          openLabel={t('admin.dashboard.next.open')}
        >
          {data.nextUp.length ? (
            <motion.div className="stack-list" variants={reduced ? stillContainer : listContainer(data.nextUp.length)} initial="hidden" animate="shown">
              {data.nextUp.slice(0, 6).map((task) => (
                <TaskRow key={task.id} task={task} today={data.today} dense onOpen={() => navigate(`/equipment/${task.equipment.id}`)} />
              ))}
            </motion.div>
          ) : (
            <EmptyState icon="sparkle" title={t('admin.dashboard.next.empty.title')} body={t('admin.dashboard.next.empty.body')} />
          )}
        </Panel>

        {s.hiddenPending ? (
          <motion.aside variants={riseIn} className="note-strip" style={{ gridColumn: 'span 12' }}>
            <Icon name="info" size={15} />
            <p>{t('admin.dashboard.hidden.body', { count: s.hiddenPending })}</p>
            <button type="button" className="ghost-link" onClick={go('/tasks?hidden=1')}>{t('admin.dashboard.hidden.action')}</button>
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
