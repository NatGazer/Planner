import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from '@ui/lib/router';
import { useResource } from '@ui/lib/useResource';
import { useSession, useSignOutOn401 } from '@ui/lib/session';
import { usePrefersReducedMotion, useTilt } from '@ui/anim/hooks';
import { listContainer, riseIn, setZoomOrigin, spring, stillContainer } from '@ui/anim/motion';
import { Icon, TYPE_ICONS, type IconName } from '@ui/components/Icon';
import { Button } from '@ui/components/Button';
import { Sheet } from '@ui/components/Sheet';
import { TextField } from '@ui/components/Field';
import { EmptyState, ErrorState, Skeleton } from '@ui/components/states';
import { useToaster } from '@ui/components/Toaster';
import { ACCENTS, accentClass } from '@ui/lib/status';
import { ApiError } from '@ui/lib/api';
import type { EquipmentType } from '@ui/lib/types';
import { adminApi } from '../data';

/**
 * Types are the spine of the whole system: maintenance is defined once per
 * type, and every physical item of that type inherits it.
 */
export function TypeList() {
  const { navigate } = useRouter();
  const { signOut } = useSession();
  const toaster = useToaster();
  const reduced = usePrefersReducedMotion();
  const list = useResource(() => adminApi.types(), []);
  useSignOutOn401(list.error, signOut);

  const [editing, setEditing] = useState<EquipmentType | null>(null);
  const [adding, setAdding] = useState(false);

  const types = list.data?.types ?? [];

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Equipment types</h1>
          <p className="page__lede">
            Define maintenance once per type. Every item of that type inherits it with a schedule of its own.
          </p>
        </div>
        <div className="page__head-actions">
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>New type</Button>
        </div>
      </header>

      {list.error && !list.data ? (
        <ErrorState message={list.error.message} onRetry={() => void list.reload()} />
      ) : !list.data ? (
        <div className="card-grid">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={150} radius={20} />)}</div>
      ) : types.length === 0 ? (
        <EmptyState
          icon="types" title="No equipment types yet"
          body="Start with a type — “HVAC Unit”, “Forklift”, “Fire Extinguisher” — then define what maintenance it needs."
          action={<Button variant="primary" icon="plus" onClick={() => setAdding(true)}>New type</Button>}
        />
      ) : (
        <motion.div className="card-grid stage" variants={reduced ? stillContainer : listContainer(types.length, 0.03)} initial="hidden" animate="shown">
          {types.map((type) => (
            <TypeCard
              key={type.id} type={type}
              onEdit={() => setEditing(type)}
              onEquipment={() => navigate(`/equipment?type=${type.id}`)}
              onRules={() => navigate(`/rules?type=${type.id}`)}
            />
          ))}
        </motion.div>
      )}

      <TypeForm
        open={adding || !!editing}
        existing={editing}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSaved={() => void list.reload()}
        onArchive={editing ? async () => {
          try {
            await adminApi.archiveType(editing.id);
            toaster.success('Type archived', 'Its history is preserved and stays readable.');
            setEditing(null);
            await list.reload();
          } catch (err) {
            toaster.error('Could not archive', err instanceof ApiError ? err.message : 'Please try again.');
          }
        } : undefined}
      />
    </div>
  );
}

function TypeCard({ type, onEdit, onEquipment, onRules }: {
  type: EquipmentType; onEdit: () => void; onEquipment: () => void; onRules: () => void;
}) {
  const tilt = useTilt({ max: 8, scale: 1.018 });
  const reduced = usePrefersReducedMotion();
  return (
    <motion.article
      variants={riseIn}
      className={`type-card ${accentClass(type.accent)}`}
      style={tilt.style}
      {...tilt.handlers}
      transition={spring.snap}
    >
      {tilt.glare ? <motion.span className="surface__glare" style={{ '--gx': tilt.glare.x, '--gy': tilt.glare.y, opacity: tilt.glare.opacity } as never} aria-hidden="true" /> : null}
      <header className="type-card__head">
        <span className="type-card__glyph"><Icon name={type.icon as IconName} size={22} /></span>
        <h2 className="type-card__name">{type.name}</h2>
        <button type="button" className="type-card__edit" onClick={onEdit} aria-label={`Edit ${type.name}`}>
          <Icon name="edit" size={15} />
        </button>
      </header>
      <div className="type-card__stats">
        <motion.button type="button" className="type-card__stat" onClick={onEquipment}
          onPointerDown={(e) => setZoomOrigin(e.currentTarget as HTMLElement)}
          whileTap={reduced ? undefined : { scale: 0.96 }}>
          <span className="type-card__stat-value">{type.activeEquipmentCount}</span>
          <span className="type-card__stat-label">in service</span>
          {type.equipmentCount !== type.activeEquipmentCount ? (
            <span className="type-card__stat-note">{type.equipmentCount - type.activeEquipmentCount} deactivated</span>
          ) : null}
        </motion.button>
        <motion.button type="button" className="type-card__stat" onClick={onRules}
          onPointerDown={(e) => setZoomOrigin(e.currentTarget as HTMLElement)}
          whileTap={reduced ? undefined : { scale: 0.96 }}>
          <span className="type-card__stat-value">{type.activeRuleCount}</span>
          <span className="type-card__stat-label">{type.activeRuleCount === 1 ? 'maintenance task' : 'maintenance tasks'}</span>
          {type.ruleCount !== type.activeRuleCount ? (
            <span className="type-card__stat-note">{type.ruleCount - type.activeRuleCount} deactivated</span>
          ) : null}
        </motion.button>
      </div>
      <footer className="type-card__foot">
        <button type="button" className="ghost-link" onClick={onEquipment}>Equipment <Icon name="arrowRight" size={13} /></button>
        <button type="button" className="ghost-link" onClick={onRules}>Maintenance <Icon name="arrowRight" size={13} /></button>
      </footer>
    </motion.article>
  );
}

function TypeForm({ open, existing, onClose, onSaved, onArchive }: {
  open: boolean; existing: EquipmentType | null; onClose: () => void; onSaved: () => void; onArchive?: () => Promise<void>;
}) {
  const toaster = useToaster();
  const [name, setName] = useState('');
  const [accent, setAccent] = useState<string>('aurora');
  const [icon, setIcon] = useState<string>('cube');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? '');
    setAccent(existing?.accent ?? 'aurora');
    setIcon(existing?.icon ?? 'cube');
    setError(null);
  }, [open, existing]);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (existing) await adminApi.updateType(existing.id, { name: name.trim(), accent, icon });
      else await adminApi.createType({ name: name.trim(), accent, icon });
      toaster.success(existing ? 'Type updated' : `“${name.trim()}” added`,
        existing ? undefined : 'Now define what maintenance it needs.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <Sheet
      open={open} onClose={onClose}
      title={existing ? 'Edit equipment type' : 'New equipment type'}
      size="sm"
      footer={
        <>
          {onArchive ? (
            <Button variant="danger" icon="archive" onClick={() => void onArchive()}>Archive</Button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={save}>
              {existing ? 'Save changes' : 'Create type'}
            </Button>
          </div>
        </>
      }
    >
      <TextField label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="HVAC Unit" error={error} />

      <div className="picker">
        <span className="picker__label">Colour</span>
        <div className="picker__row">
          {ACCENTS.map((a) => (
            <button
              key={a} type="button"
              className={`swatch ${accentClass(a)}${accent === a ? ' is-selected' : ''}`}
              onClick={() => setAccent(a)} aria-label={a} aria-pressed={accent === a}
            >
              <span className="swatch__fill" />
            </button>
          ))}
        </div>
      </div>

      <div className="picker">
        <span className="picker__label">Symbol</span>
        <div className="picker__row picker__row--wrap">
          {TYPE_ICONS.map((i) => (
            <button
              key={i} type="button"
              className={`glyph-option ${accentClass(accent)}${icon === i ? ' is-selected' : ''}`}
              onClick={() => setIcon(i)} aria-label={i} aria-pressed={icon === i}
            >
              <Icon name={i} size={18} />
            </button>
          ))}
        </div>
      </div>

      {onArchive ? (
        <p className="sheet__note sheet__note--quiet">
          Archiving hides a type and its maintenance tasks. It is only possible once no equipment uses it.
          Completed history always survives — it carries its own copy of the details.
        </p>
      ) : null}
    </Sheet>
  );
}
