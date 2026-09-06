import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useResource } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { useDebounced, usePrefersReducedMotion } from '@ui/anim/hooks';
import { listContainer, riseIn, stillContainer } from '@ui/anim/motion';
import { Icon } from '@ui/components/Icon';
import { Button } from '@ui/components/Button';
import { SelectField, TextField } from '@ui/components/Field';
import { EmptyState, ErrorState, Skeleton } from '@ui/components/states';
import { errorMessage } from '@ui/lib/errors';
import { useT, type TFunc } from '@ui/lib/i18n';
import { shiftDate, shortDate } from '@ui/lib/format';
import { adminApi } from '../data';
import { CompletionSheet } from '../components/CompletionSheet';
import { CompletionRow } from '../components/primitives';

const PAGE = 40;

/**
 * Everything that has been completed, across the whole estate. Each record is
 * a frozen snapshot — the equipment and maintenance details are the ones that
 * were true on the day, not today's.
 */
export function HistoryScreen() {
  const t = useT();
  const { query, navigate } = useRouter();
  const { signOut } = useSession();
  const reduced = usePrefersReducedMotion();

  const [search, setSearch] = useState('');
  const [typeId, setTypeId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [viewing, setViewing] = useState<string | null>(query.get('completion'));
  const debounced = useDebounced(search, 240);

  useEffect(() => { setLimit(PAGE); }, [debounced, typeId, employeeId, from, to]);

  const filters = useMemo(() => ({
    search: debounced || null, typeId: typeId || null, employeeId: employeeId || null,
    from: from || null, to: to || null, limit,
  }), [debounced, typeId, employeeId, from, to, limit]);

  const list = useResource(() => adminApi.history(filters), [JSON.stringify(filters)]);
  const support = useResource(() => Promise.all([adminApi.types(), adminApi.employees()]), []);
  useSignOutOn401(list.error, signOut);

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const today = list.data?.today ?? '';

  const anyFilter = !!(debounced || typeId || employeeId || from || to);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">{t('admin.history.title')}</h1>
          <p className="page__lede">
            {list.data
              ? t(anyFilter ? 'admin.history.lede.filtered' : 'admin.history.lede.all', { count: total })
              : t('common.loading')}
          </p>
        </div>
      </header>

      <div className="filterbar">
        <div className="filterbar__row">
          <label className="search">
            <Icon name="search" size={15} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t('admin.history.search.placeholder')} aria-label={t('admin.history.search.aria')} />
            {search ? <button type="button" onClick={() => setSearch('')} aria-label={t('admin.history.search.clear')}><Icon name="close" size={13} /></button> : null}
          </label>
          <SelectField aria-label={t('admin.history.filter.type')} value={typeId} onChange={(e) => setTypeId(e.target.value)}
            placeholder={t('admin.history.filter.allTypes')}
            options={(support.data?.[0].types ?? []).map((type) => ({ value: type.id, label: type.name }))} />
          <SelectField aria-label={t('admin.history.filter.person')} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
            placeholder={t('admin.history.filter.anyone')}
            options={(support.data?.[1].employees ?? []).map((e) => ({ value: e.id, label: e.name }))} />
        </div>
        <div className="filterbar__row filterbar__row--dates">
          <TextField aria-label={t('admin.history.filter.fromDate')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="filterbar__dash">{t('admin.history.filter.rangeTo')}</span>
          <TextField aria-label={t('admin.history.filter.toDate')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          {today ? (
            <div className="filterbar__quick">
              <button type="button" className="chip" onClick={() => { setFrom(shiftDate(today, -6)); setTo(today); }}>{t('admin.history.range.last7')}</button>
              <button type="button" className="chip" onClick={() => { setFrom(shiftDate(today, -29)); setTo(today); }}>{t('admin.history.range.last30')}</button>
              {anyFilter ? (
                <button type="button" className="chip chip--clear" onClick={() => { setSearch(''); setTypeId(''); setEmployeeId(''); setFrom(''); setTo(''); }}>
                  <Icon name="close" size={12} /> {t('common.clear')}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {list.error && !list.data ? (
        <ErrorState message={errorMessage(t, list.error)} onRetry={() => void list.reload()} />
      ) : !list.data ? (
        <div className="stack-list">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={72} radius={16} />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={anyFilter ? 'search' : 'history'}
          title={anyFilter ? t('admin.history.empty.filtered.title') : t('admin.history.empty.title')}
          body={anyFilter
            ? t('admin.history.empty.filtered.body')
            : t('admin.history.empty.body')}
          action={anyFilter
            ? <Button variant="secondary" icon="close" onClick={() => { setSearch(''); setTypeId(''); setEmployeeId(''); setFrom(''); setTo(''); }}>{t('admin.history.empty.clearFilters')}</Button>
            : <Button variant="secondary" icon="tasks" onClick={() => navigate('/tasks')}>{t('admin.history.empty.seeTasks')}</Button>}
        />
      ) : (
        <>
          <motion.div className="stack-list" variants={reduced ? stillContainer : listContainer(items.length, 0.02)} initial="hidden" animate="shown">
            {items.map((c) => <CompletionRow key={c.id} completion={c} onOpen={() => setViewing(c.id)} />)}
          </motion.div>
          {items.length < total ? (
            <motion.div variants={riseIn} className="page__more">
              <Button variant="secondary" icon="chevronDown" loading={list.refreshing} onClick={() => setLimit((n) => n + PAGE)}>
                {t('admin.history.showMore', { count: Math.min(PAGE, total - items.length) })}
              </Button>
              <span className="page__more-note">{shownNote(t, items.length, total, from, to)}</span>
            </motion.div>
          ) : (
            <p className="page__end">{t('admin.history.end', { count: total })}</p>
          )}
        </>
      )}

      <CompletionSheet id={viewing} onClose={() => { setViewing(null); if (query.get('completion')) navigate('/history', { replace: true }); }} />
    </div>
  );
}

/**
 * 'Showing 40 of 128 · 1 Mar to 7 Mar'. One whole sentence per shape of the
 * range: an open end gets its own key rather than a word dropped into a date
 * slot, because a half-open range is not phrased the same way everywhere.
 */
function shownNote(t: TFunc, shown: number, total: number, from: string, to: string): string {
  if (from && to) return t('admin.history.more.shownRange', { shown, total, from: shortDate(from), to: shortDate(to) });
  if (from) return t('admin.history.more.shownFrom', { shown, total, from: shortDate(from) });
  if (to) return t('admin.history.more.shownTo', { shown, total, to: shortDate(to) });
  return t('admin.history.more.shown', { shown, total });
}
