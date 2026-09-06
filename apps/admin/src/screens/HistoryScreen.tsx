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
import { plural, shiftDate, shortDate } from '@ui/lib/format';
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
          <h1 className="page__title">Completion history</h1>
          <p className="page__lede">
            {list.data ? <>{plural(total, 'completed job')}{anyFilter ? ' matching your filters' : ' recorded'} · every one with its photo</> : 'Loading…'}
          </p>
        </div>
      </header>

      <div className="filterbar">
        <div className="filterbar__row">
          <label className="search">
            <Icon name="search" size={15} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by equipment, task, person or comment" aria-label="Search history" />
            {search ? <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><Icon name="close" size={13} /></button> : null}
          </label>
          <SelectField aria-label="Filter by type" value={typeId} onChange={(e) => setTypeId(e.target.value)}
            placeholder="All types"
            options={(support.data?.[0].types ?? []).map((t) => ({ value: t.id, label: t.name }))} />
          <SelectField aria-label="Filter by person" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
            placeholder="Anyone"
            options={(support.data?.[1].employees ?? []).map((e) => ({ value: e.id, label: e.name }))} />
        </div>
        <div className="filterbar__row filterbar__row--dates">
          <TextField aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="filterbar__dash">to</span>
          <TextField aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          {today ? (
            <div className="filterbar__quick">
              <button type="button" className="chip" onClick={() => { setFrom(shiftDate(today, -6)); setTo(today); }}>Last 7 days</button>
              <button type="button" className="chip" onClick={() => { setFrom(shiftDate(today, -29)); setTo(today); }}>Last 30 days</button>
              {anyFilter ? (
                <button type="button" className="chip chip--clear" onClick={() => { setSearch(''); setTypeId(''); setEmployeeId(''); setFrom(''); setTo(''); }}>
                  <Icon name="close" size={12} /> Clear
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {list.error && !list.data ? (
        <ErrorState message={list.error.message} onRetry={() => void list.reload()} />
      ) : !list.data ? (
        <div className="stack-list">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={72} radius={16} />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={anyFilter ? 'search' : 'history'}
          title={anyFilter ? 'Nothing matches those filters' : 'No completed work yet'}
          body={anyFilter
            ? 'Try a wider date range, or clear the filters.'
            : 'When the team submits maintenance from the worker app, it lands here — photo, person, and the exact time it was recorded.'}
          action={anyFilter
            ? <Button variant="secondary" icon="close" onClick={() => { setSearch(''); setTypeId(''); setEmployeeId(''); setFrom(''); setTo(''); }}>Clear filters</Button>
            : <Button variant="secondary" icon="tasks" onClick={() => navigate('/tasks')}>See outstanding work</Button>}
        />
      ) : (
        <>
          <motion.div className="stack-list" variants={reduced ? stillContainer : listContainer(items.length, 0.02)} initial="hidden" animate="shown">
            {items.map((c) => <CompletionRow key={c.id} completion={c} onOpen={() => setViewing(c.id)} />)}
          </motion.div>
          {items.length < total ? (
            <motion.div variants={riseIn} className="page__more">
              <Button variant="secondary" icon="chevronDown" loading={list.refreshing} onClick={() => setLimit((n) => n + PAGE)}>
                Show {Math.min(PAGE, total - items.length)} more
              </Button>
              <span className="page__more-note">{items.length} of {total}{from || to ? ` · ${from ? shortDate(from) : 'the start'} to ${to ? shortDate(to) : 'today'}` : ''}</span>
            </motion.div>
          ) : (
            <p className="page__end">That is all {plural(total, 'record')}.</p>
          )}
        </>
      )}

      <CompletionSheet id={viewing} onClose={() => { setViewing(null); if (query.get('completion')) navigate('/history', { replace: true }); }} />
    </div>
  );
}
