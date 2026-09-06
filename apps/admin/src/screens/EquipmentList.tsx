import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useResource } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { useDebounced, usePrefersReducedMotion, useTilt } from '@ui/anim/hooks';
import { listContainer, riseIn, setZoomOrigin, spring, stillContainer } from '@ui/anim/motion';
import { Icon, type IconName } from '@ui/components/Icon';
import { Button } from '@ui/components/Button';
import { Segmented, SelectField } from '@ui/components/Field';
import { EmptyState, ErrorState, Skeleton } from '@ui/components/states';
import { accentClass } from '@ui/lib/status';
import { errorMessage } from '@ui/lib/errors';
import { useT } from '@ui/lib/i18n';
import { relative, shortDate } from '@ui/lib/format';
import type { EquipmentSummary } from '@ui/lib/types';
import { adminApi } from '../data';
import { EquipmentForm } from '../components/EquipmentForm';
import { DueBadge } from '../components/primitives';

type Scope = 'active' | 'inactive' | 'all';

/** Every physical item, one card each, with its own live schedule summary. */
export function EquipmentList() {
  const t = useT();
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
          <h1 className="page__title">{t('admin.equipment.title')}</h1>
          <p className="page__lede">
            {list.data ? t('admin.equipment.lede.count', { count: items.length }) : t('admin.equipment.lede.loading')}
          </p>
        </div>
        <div className="page__head-actions">
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>{t('admin.equipment.add')}</Button>
        </div>
      </header>

      <div className="filterbar">
        <Segmented
          ariaLabel={t('admin.equipment.filter.scope')}
          layoutId="eqscope"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'active', label: t('admin.equipment.scope.active') },
            { value: 'inactive', label: t('admin.equipment.scope.inactive') },
            { value: 'all', label: t('admin.equipment.scope.all') },
          ]}
        />
        <div className="filterbar__row">
          <label className="search">
            <Icon name="search" size={15} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t('admin.equipment.search.placeholder')} aria-label={t('admin.equipment.search.aria')} />
            {search ? <button type="button" onClick={() => setSearch('')} aria-label={t('admin.equipment.search.clear')}><Icon name="close" size={13} /></button> : null}
          </label>
          <SelectField
            aria-label={t('admin.equipment.filter.type')}
            value={typeId}
            onChange={(e) => { setTypeId(e.target.value); navigate(e.target.value ? `/equipment?type=${e.target.value}` : '/equipment', { replace: true }); }}
            placeholder={t('admin.equipment.filter.allTypes')}
            options={(support.data?.[0].types ?? []).map((type) => ({ value: type.id, label: t('admin.equipment.filter.typeOption', { name: type.name, count: type.equipmentCount }) }))}
          />
        </div>
      </div>

      {list.error && !list.data ? (
        <ErrorState message={errorMessage(t, list.error)} onRetry={() => void list.reload()} />
      ) : !list.data ? (
        <div className="card-grid">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={168} radius={20} />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="equipment"
          title={debounced || typeId ? t('admin.equipment.empty.filtered.title') : t('admin.equipment.empty.title')}
          body={debounced || typeId
            ? t('admin.equipment.empty.filtered.body')
            : t('admin.equipment.empty.body')}
          action={<Button variant="primary" icon="plus" onClick={() => setAdding(true)}>{t('admin.equipment.add')}</Button>}
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
  const t = useT();
  const tilt = useTilt({ max: 8, scale: 1.018 });
  const reduced = usePrefersReducedMotion();
  const overdue = !!item.nextDue && item.nextDue < today;
  const dueToday = item.nextDue === today;

  return (
    <motion.button
      type="button"
      variants={riseIn}
      className={`eq-card ${accentClass(item.type.accent)}${item.active ? '' : ' is-inactive'}${overdue ? ' has-overdue' : ''}`}
      onPointerDown={(e) => setZoomOrigin(e.currentTarget as HTMLElement)}
      onClick={onOpen}
      style={tilt.style}
      {...tilt.handlers}
      whileTap={reduced ? undefined : { scale: 0.982 }}
      transition={spring.snap}
    >
      {tilt.glare ? <motion.span className="surface__glare" style={{ '--gx': tilt.glare.x, '--gy': tilt.glare.y, opacity: tilt.glare.opacity } as never} aria-hidden="true" /> : null}

      <span className="eq-card__top">
        <span className="eq-card__glyph"><Icon name={item.type.icon as IconName} size={20} /></span>
        <span className="eq-card__ident">
          <span className="eq-card__code">{item.code}</span>
          <span className="eq-card__type">{item.type.name}</span>
        </span>
        {!item.active ? <span className="eq-card__flag">{t('admin.equipment.card.deactivated')}</span> : null}
      </span>

      <span className="eq-card__name">{item.name}</span>
      {item.location ? (
        <span className="eq-card__location"><Icon name="pin" size={12} /> {item.location}</span>
      ) : <span className="eq-card__location eq-card__location--none">{t('admin.equipment.card.noLocation')}</span>}

      <span className="eq-card__foot">
        <span className="eq-card__stat">
          <span className="eq-card__stat-value">{item.pendingCount}</span>
          <span className="eq-card__stat-label">{t('admin.equipment.card.scheduled', { count: item.pendingCount })}</span>
        </span>
        <span className="eq-card__stat">
          <span className="eq-card__stat-value">{item.completionCount}</span>
          <span className="eq-card__stat-label">{t('admin.equipment.card.completed', { count: item.completionCount })}</span>
        </span>
        <span className="eq-card__next">
          {item.nextDue ? (
            <DueBadge
              bucket={overdue ? 'overdue' : dueToday ? 'today' : 'later'}
              label={overdue ? t('status.overdue') : dueToday ? t('status.today') : t('admin.equipment.card.next', { date: shortDate(item.nextDue, today) })}
              compact
            />
          ) : <span className="eq-card__none">{t('admin.equipment.card.noSchedule')}</span>}
        </span>
      </span>

      {item.lastCompletedAt ? (
        <span className="eq-card__last">{t('admin.equipment.card.lastServiced', { when: relative(item.lastCompletedAt) })}</span>
      ) : <span className="eq-card__last eq-card__last--none">{t('admin.equipment.card.neverServiced')}</span>}
    </motion.button>
  );
}
