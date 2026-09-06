import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useResource } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { usePrefersReducedMotion, useTilt } from '@ui/anim/hooks';
import { listContainer, riseIn, setZoomOrigin, spring, stillContainer } from '@ui/anim/motion';
import { Icon, type IconName } from '@ui/components/Icon';
import { Button } from '@ui/components/Button';
import { Segmented, SelectField } from '@ui/components/Field';
import { EmptyState, ErrorState, Skeleton } from '@ui/components/states';
import { accentClass } from '@ui/lib/status';
import { cadence, plural } from '@ui/lib/format';
import type { MaintenanceRule } from '@ui/lib/types';
import { adminApi } from '../data';
import { RuleForm } from '../components/RuleForm';

type Scope = 'active' | 'inactive' | 'all';

/**
 * Maintenance tasks, grouped by the equipment type they belong to — because
 * that is the relationship that matters: a type can carry several independent
 * tasks, and every item of the type inherits all of them.
 */
export function RuleList() {
  const { query, navigate } = useRouter();
  const { signOut, today } = useSession();
  const reduced = usePrefersReducedMotion();

  const [scope, setScope] = useState<Scope>('all');
  const [typeId, setTypeId] = useState(query.get('type') ?? '');
  const [adding, setAdding] = useState(query.get('new') === '1');

  const filters = useMemo(() => ({
    typeId: typeId || null,
    active: scope === 'all' ? null : scope === 'active',
  }), [typeId, scope]);

  const list = useResource(() => adminApi.rules(filters), [JSON.stringify(filters)]);
  const types = useResource(() => adminApi.types(), []);
  useSignOutOn401(list.error, signOut);

  useEffect(() => { if (query.get('new') === '1') setAdding(true); }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, { type: MaintenanceRule['type']; rules: MaintenanceRule[] }>();
    for (const rule of list.data?.rules ?? []) {
      const bucket = map.get(rule.type.id) ?? { type: rule.type, rules: [] };
      bucket.rules.push(rule);
      map.set(rule.type.id, bucket);
    }
    return [...map.values()];
  }, [list.data]);

  const total = list.data?.rules.length ?? 0;

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Maintenance</h1>
          <p className="page__lede">
            {list.data
              ? <>{plural(total, 'task')} across {plural(grouped.length, 'equipment type')} · each item of a type keeps its own schedule</>
              : 'Loading…'}
          </p>
        </div>
        <div className="page__head-actions">
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>New maintenance task</Button>
        </div>
      </header>

      <div className="filterbar">
        <Segmented
          ariaLabel="Filter by status" layoutId="rulescope" value={scope} onChange={setScope}
          options={[{ value: 'all', label: 'Everything' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Deactivated' }]}
        />
        <div className="filterbar__row">
          <SelectField
            aria-label="Filter by type" value={typeId}
            onChange={(e) => { setTypeId(e.target.value); navigate(e.target.value ? `/rules?type=${e.target.value}` : '/rules', { replace: true }); }}
            placeholder="All equipment types"
            options={(types.data?.types ?? []).map((t) => ({ value: t.id, label: `${t.name} (${t.ruleCount})` }))}
          />
        </div>
      </div>

      {list.error && !list.data ? (
        <ErrorState message={list.error.message} onRetry={() => void list.reload()} />
      ) : !list.data ? (
        <div className="stack-list">{[0, 1, 2].map((i) => <Skeleton key={i} height={150} radius={20} />)}</div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon="rules"
          title={typeId || scope !== 'all' ? 'Nothing matches' : 'No maintenance tasks yet'}
          body={typeId || scope !== 'all'
            ? 'Try clearing the filters.'
            : 'Define what needs doing and how often. Every item of the chosen type picks it up straight away.'}
          action={<Button variant="primary" icon="plus" onClick={() => setAdding(true)}>New maintenance task</Button>}
        />
      ) : (
        <motion.div className="rule-groups stage" variants={reduced ? stillContainer : listContainer(grouped.length, 0.03)} initial="hidden" animate="shown">
          {grouped.map((group) => (
            <motion.section key={group.type.id} variants={riseIn} className={`rule-group ${accentClass(group.type.accent)}`}>
              <header className="rule-group__head">
                <span className="rule-group__glyph"><Icon name={group.type.icon as IconName} size={17} /></span>
                <h2 className="rule-group__title">{group.type.name}</h2>
                <span className="rule-group__count">{plural(group.rules.length, 'task')}</span>
                <button type="button" className="ghost-link" onClick={() => { setTypeId(group.type.id); setAdding(true); }}>
                  <Icon name="plus" size={13} /> Add
                </button>
              </header>
              <div className="rule-group__body">
                {group.rules.map((rule) => (
                  <RuleCard key={rule.id} rule={rule} onOpen={() => navigate(`/rules/${rule.id}`)} />
                ))}
              </div>
            </motion.section>
          ))}
        </motion.div>
      )}

      <RuleForm
        open={adding}
        onClose={() => { setAdding(false); if (query.get('new')) navigate('/rules', { replace: true }); }}
        onSaved={() => { void list.reload(); void types.reload(); }}
        types={types.data?.types ?? []}
        today={today}
        defaultTypeId={typeId || undefined}
      />
    </div>
  );
}

function RuleCard({ rule, onOpen }: { rule: MaintenanceRule; onOpen: () => void }) {
  const tilt = useTilt({ max: 5, scale: 1.012 });
  const reduced = usePrefersReducedMotion();
  return (
    <motion.button
      type="button"
      className={`rule-card${rule.active ? '' : ' is-inactive'}`}
      onPointerDown={(e) => setZoomOrigin(e.currentTarget as HTMLElement)}
      onClick={onOpen}
      style={tilt.style}
      {...tilt.handlers}
      whileTap={reduced ? undefined : { scale: 0.99 }}
      transition={spring.snap}
    >
      {tilt.glare ? <motion.span className="surface__glare" style={{ '--gx': tilt.glare.x, '--gy': tilt.glare.y, opacity: tilt.glare.opacity } as never} aria-hidden="true" /> : null}
      <span className="rule-card__head">
        <span className="rule-card__title">{rule.title}</span>
        {!rule.active ? <span className="rule-card__flag">Deactivated</span> : null}
      </span>
      {rule.instructions ? <span className="rule-card__instructions">{rule.instructions}</span> : <span className="rule-card__instructions rule-card__instructions--none">No instructions written yet.</span>}
      <span className="rule-card__foot">
        <span className="cadence-chip"><Icon name="refresh" size={11} /> {cadence(rule.intervalValue, rule.intervalUnit)}</span>
        <span className="rule-card__stat">{plural(rule.pendingCount, 'scheduled')}</span>
        <span className="rule-card__stat">{plural(rule.completionCount, 'completion')}</span>
        <Icon name="chevronRight" size={15} className="rule-card__go" />
      </span>
    </motion.button>
  );
}
