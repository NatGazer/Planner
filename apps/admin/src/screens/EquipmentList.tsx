import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useResource } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { useDebounced, usePrefersReducedMotion, useTilt } from '@ui/anim/hooks';
import { listContainer, riseIn, spring, stillContainer } from '@ui/anim/motion';
import { Icon, type IconName } from '@ui/components/Icon';
import { Button } from '@ui/components/Button';
import { Segmented, SelectField } from '@ui/components/Field';
import { EmptyState, ErrorState, Skeleton } from '@ui/components/states';
import { accentClass } from '@ui/lib/status';
import { plural, relative, shortDate } from '@ui/lib/format';
import type { EquipmentSummary } from '@ui/lib/types';
import { adminApi } from '../data';
import { EquipmentForm } from '../components/EquipmentForm';
import { DueBadge } from '../components/primitives';

type Scope = 'active' | 'inactive' | 'all';

/** Every physical item, one card each, with its own live schedule summary. */
export function EquipmentList() {
  const { query, navigate } = useRouter();
  const { signOut } = useSession();
  const reduced = usePrefersReducedMotion();

  const [scope, setScope] = useState<Scope>('active');
  const [typeId, setTypeId] = useState(query.get('type') ?? '');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const debounced = useDebounced(search, 240);

  const filters = useMemo(() => ({
    typeId: typeId || null,
    active: scope === 'all' ? null : scope === 'active',
    search: debounced || null,
  }), [typeId, scope, debounced]);

  const list = useResource(() => adminApi.equipment(filters), [JSON.stringify(filters)]);
  const support = useResource(() => Promise.all([adminApi.types(), adminApi.rules()]), []);
  useSignOutOn401(list.error, signOut);

  const items = list.data?.equipment ?? [];
  const today = list.data?.today ?? '';

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Equipment</h1>
          <p className="page__lede">
            {list.data ? <>{plural(items.length, 'item')} shown · one record per physical thing on site</> : 'Loading the estate…'}
          </p>
        </div>
        <div className="page__head-actions">
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add equipment</Button>
        </div>
      </header>

      <div className="filterbar">
        <Segmented
          ariaLabel="Filter by status"
          layoutId="eqscope"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'active', label: 'In service' },
            { value: 'inactive', label: 'Deactivated' },
            { value: 'all', label: 'Everything' },
          ]}
        />
        <div className="filterbar__row">
          <label className="search">
            <Icon name="search" size={15} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code, name or location" aria-label="Search equipment" />
            {search ? <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><Icon name="close" size={13} /></button> : null}
          </label>
          <SelectField
            aria-label="Filter by type"
            value={typeId}
            onChange={(e) => { setTypeId(e.target.value); navigate(e.target.value ? `/equipment?type=${e.target.value}` : '/equipment', { replace: true }); }}
            placeholder="All types"
            options={(support.data?.[0].types ?? []).map((t) => ({ value: t.id, label: `${t.name} (${t.equipmentCount})` }))}
          />
        </div>
      </div>

      {list.error && !list.data ? (
        <ErrorState message={list.error.message} onRetry={() => void list.reload()} />
      ) : !list.data ? (
        <div className="card-grid">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={168} radius={20} />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="equipment"
          title={debounced || typeId ? 'Nothing matches' : 'No equipment yet'}
          body={debounced || typeId
            ? 'Try a different search, or clear the type filter.'
            : 'Add your first item and it will inherit every maintenance task defined for its type.'}
          action={<Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add equipment</Button>}
        />
      ) : (
        <motion.div className="card-grid stage" variants={reduced ? stillContainer : listContainer(items.length, 0.03)} initial="hidden" animate="shown">
          {items.map((item) => (
            <EquipmentCard key={item.id} item={item} today={today} onOpen={() => navigate(`/equipment/${item.id}`)} />
          ))}
        </motion.div>
      )}

      <EquipmentForm
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(equipment) => { void list.reload(); navigate(`/equipment/${equipment.id}`); }}
        types={support.data?.[0].types ?? []}
        rules={support.data?.[1].rules ?? []}
        today={today}
        defaultTypeId={typeId || undefined}
      />
    </div>
  );
}

function EquipmentCard({ item, today, onOpen }: { item: EquipmentSummary; today: string; onOpen: () => void }) {
  const tilt = useTilt({ max: 8, scale: 1.018 });
  const reduced = usePrefersReducedMotion();
  const overdue = !!item.nextDue && item.nextDue < today;
  const dueToday = item.nextDue === today;

  return (
    <motion.button
      type="button"
      variants={riseIn}
      layoutId={`equipment-${item.id}`}
      className={`eq-card ${accentClass(item.type.accent)}${item.active ? '' : ' is-inactive'}${overdue ? ' has-overdue' : ''}`}
      onClick={onOpen}
      style={tilt.style}
      {...tilt.handlers}
      whileTap={reduced ? undefined : { scale: 0.985 }}
      transition={spring.snap}
    >
      {tilt.glare ? <motion.span className="surface__glare" style={{ '--gx': tilt.glare.x, '--gy': tilt.glare.y, opacity: tilt.glare.opacity } as never} aria-hidden="true" /> : null}

      <span className="eq-card__top">
        <span className="eq-card__glyph"><Icon name={item.type.icon as IconName} size={20} /></span>
        <span className="eq-card__ident">
          <span className="eq-card__code">{item.code}</span>
          <span className="eq-card__type">{item.type.name}</span>
        </span>
        {!item.active ? <span className="eq-card__flag">Deactivated</span> : null}
      </span>

      <span className="eq-card__name">{item.name}</span>
      {item.location ? (
        <span className="eq-card__location"><Icon name="pin" size={12} /> {item.location}</span>
      ) : <span className="eq-card__location eq-card__location--none">No location recorded</span>}

      <span className="eq-card__foot">
        <span className="eq-card__stat">
          <span className="eq-card__stat-value">{item.pendingCount}</span>
          <span className="eq-card__stat-label">scheduled</span>
        </span>
        <span className="eq-card__stat">
          <span className="eq-card__stat-value">{item.completionCount}</span>
          <span className="eq-card__stat-label">completed</span>
        </span>
        <span className="eq-card__next">
          {item.nextDue ? (
            <DueBadge
              bucket={overdue ? 'overdue' : dueToday ? 'today' : 'later'}
              label={overdue ? 'Overdue' : dueToday ? 'Due today' : `Next ${shortDate(item.nextDue, today)}`}
              compact
            />
          ) : <span className="eq-card__none">No schedule</span>}
        </span>
      </span>

      {item.lastCompletedAt ? (
        <span className="eq-card__last">Last serviced {relative(item.lastCompletedAt)}</span>
      ) : <span className="eq-card__last eq-card__last--none">Never serviced</span>}
    </motion.button>
  );
}
