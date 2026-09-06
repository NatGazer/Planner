import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@ui/components/Sheet';
import { Button } from '@ui/components/Button';
import { SelectField, Switch, TextField } from '@ui/components/Field';
import { useToaster } from '@ui/components/Toaster';
import { ApiError } from '@ui/lib/api';
import { addInterval, longDate, plural, shiftDate } from '@ui/lib/format';
import type { EquipmentSummary, EquipmentType, MaintenanceRule } from '@ui/lib/types';
import { adminApi } from '../data';

export interface EquipmentFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: (equipment: EquipmentSummary) => void;
  types: EquipmentType[];
  rules: MaintenanceRule[];
  today: string;
  /** Absent for a new item. */
  existing?: EquipmentSummary | null;
  defaultTypeId?: string;
}

/**
 * One form for adding and editing a physical item. The panel explains, before
 * anything is saved, exactly which maintenance the item is about to inherit
 * and when the first occurrence will fall due — so nobody has to guess what
 * pressing Save is going to do to the schedule.
 */
export function EquipmentForm({ open, onClose, onSaved, types, rules, today, existing, defaultTypeId }: EquipmentFormProps) {
  const toaster = useToaster();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState('');
  const [location, setLocation] = useState('');
  const [active, setActive] = useState(true);
  const [useCustomDue, setUseCustomDue] = useState(false);
  const [firstDueDate, setFirstDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(existing?.code ?? '');
    setName(existing?.name ?? '');
    setTypeId(existing?.type.id ?? defaultTypeId ?? types[0]?.id ?? '');
    setLocation(existing?.location ?? '');
    setActive(existing ? existing.active : true);
    setUseCustomDue(false);
    setFirstDueDate(shiftDate(today, 7));
    setError(null);
  }, [open, existing, defaultTypeId, types, today]);

  const inherited = useMemo(
    () => rules.filter((r) => r.type.id === typeId && r.active),
    [rules, typeId],
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        const { equipment } = await adminApi.updateEquipment(existing.id, {
          code: code.trim(), name: name.trim(), typeId, location: location.trim() || null, active,
        });
        toaster.success('Equipment updated', `${equipment.code} — ${equipment.name}`);
        onSaved(equipment);
      } else {
        const result = await adminApi.createEquipment({
          code: code.trim(), name: name.trim(), typeId, location: location.trim() || undefined, active,
          firstDueDate: useCustomDue ? firstDueDate : null,
        });
        toaster.success(
          `${result.equipment.code} added`,
          result.tasksOpened
            ? `${plural(result.tasksOpened, 'maintenance task')} scheduled for it.`
            : 'This type has no maintenance tasks yet.',
        );
        onSaved(result.equipment);
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError({ field: err.field, message: err.message });
      else setError({ message: 'Could not save. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const valid = code.trim() && name.trim() && typeId;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit equipment' : 'Add equipment'}
      subtitle={existing ? existing.code : 'One record per physical item'}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={save}>
            {existing ? 'Save changes' : 'Add equipment'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <TextField
          label="Asset code" required autoFocus
          value={code} onChange={(e) => setCode(e.target.value)}
          placeholder="HVAC-06"
          hint="Unique across the estate. It is what workers look for on the label."
          error={error?.field === 'code' ? error.message : null}
        />
        <TextField
          label="Name" required
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Rooftop unit — East wing"
        />
        <SelectField
          label="Equipment type" required
          value={typeId} onChange={(e) => setTypeId(e.target.value)}
          options={types.map((t) => ({ value: t.id, label: t.name }))}
          hint={existing && existing.type.id !== typeId
            ? 'Changing the type retires pending work for rules that no longer apply and opens the new type’s schedule. Completed history is never touched.'
            : 'The item inherits every maintenance task defined for this type.'}
          error={error?.field === 'typeId' ? error.message : null}
        />
        <TextField
          label="Location"
          value={location} onChange={(e) => setLocation(e.target.value)}
          placeholder="Roof, North wing"
          hint="Optional. Shown to workers so they can find it."
        />
      </div>

      <Switch
        label={active ? 'In service' : 'Deactivated'}
        description={active
          ? 'Its maintenance appears in the worker app.'
          : 'Pending tasks are hidden and keep their dates. History is preserved.'}
        checked={active}
        onChange={setActive}
      />

      {!existing ? (
        <>
          <Switch
            label="Set the first due date myself"
            description={useCustomDue
              ? 'Every inherited task will first fall due on the date below.'
              : 'By default each task first falls due one interval from today.'}
            checked={useCustomDue}
            onChange={setUseCustomDue}
          />
          {useCustomDue ? (
            <TextField label="First due date" type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} />
          ) : null}

          <div className="preview">
            <p className="preview__title">
              {inherited.length
                ? `This item will inherit ${plural(inherited.length, 'maintenance task')}`
                : 'This type has no active maintenance tasks yet'}
            </p>
            {inherited.length ? (
              <ul className="preview__list">
                {inherited.map((r) => (
                  <li key={r.id}>
                    <span className="preview__rule">{r.title}</span>
                    <span className="preview__due">
                      first due {longDate(useCustomDue ? firstDueDate : addInterval(today, r.intervalValue, r.intervalUnit))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="preview__empty">You can add maintenance tasks to the type at any time — they will open a schedule on this item automatically.</p>
            )}
          </div>
        </>
      ) : null}

      {error && !error.field ? <p className="form-error">{error.message}</p> : null}
    </Sheet>
  );
}
