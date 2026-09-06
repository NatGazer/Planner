import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@ui/components/Sheet';
import { Button } from '@ui/components/Button';
import { SelectField, Switch, TextArea, TextField } from '@ui/components/Field';
import { useToaster } from '@ui/components/Toaster';
import { ApiError } from '@ui/lib/api';
import { addInterval, cadence, longDate, plural, shiftDate } from '@ui/lib/format';
import type { EquipmentType, IntervalUnit, MaintenanceRule } from '@ui/lib/types';
import { adminApi } from '../data';

const UNITS: { value: IntervalUnit; label: string }[] = [
  { value: 'days', label: 'days' },
  { value: 'weeks', label: 'weeks' },
  { value: 'months', label: 'months' },
  { value: 'years', label: 'years' },
];

const PRESETS: { label: string; value: number; unit: IntervalUnit }[] = [
  { label: 'Weekly', value: 1, unit: 'weeks' },
  { label: 'Fortnightly', value: 2, unit: 'weeks' },
  { label: 'Monthly', value: 1, unit: 'months' },
  { label: 'Quarterly', value: 3, unit: 'months' },
  { label: 'Twice a year', value: 6, unit: 'months' },
  { label: 'Yearly', value: 1, unit: 'years' },
];

export interface RuleFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: (rule: MaintenanceRule) => void;
  types: EquipmentType[];
  today: string;
  existing?: MaintenanceRule | null;
  defaultTypeId?: string;
}

/**
 * A maintenance task belongs to a *type*, and every item of that type
 * inherits it with its own independent schedule. The form says so plainly,
 * and tells you how many items are about to get a new schedule.
 */
export function RuleForm({ open, onClose, onSaved, types, today, existing, defaultTypeId }: RuleFormProps) {
  const toaster = useToaster();
  const [typeId, setTypeId] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [intervalValue, setIntervalValue] = useState(3);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('months');
  const [active, setActive] = useState(true);
  const [useCustomDue, setUseCustomDue] = useState(false);
  const [firstDueDate, setFirstDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setTypeId(existing?.type.id ?? defaultTypeId ?? types[0]?.id ?? '');
    setTitle(existing?.title ?? '');
    setInstructions(existing?.instructions ?? '');
    setIntervalValue(existing?.intervalValue ?? 3);
    setIntervalUnit(existing?.intervalUnit ?? 'months');
    setActive(existing ? existing.active : true);
    setUseCustomDue(false);
    setFirstDueDate(shiftDate(today, 7));
    setError(null);
  }, [open, existing, defaultTypeId, types, today]);

  const type = useMemo(() => types.find((t) => t.id === typeId) ?? null, [types, typeId]);
  const frequencyChanged = !!existing && (existing.intervalValue !== intervalValue || existing.intervalUnit !== intervalUnit);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (existing) {
        const { rule } = await adminApi.updateRule(existing.id, {
          title: title.trim(), instructions, intervalValue, intervalUnit, active,
        });
        toaster.success('Maintenance task updated', frequencyChanged
          ? 'The new frequency applies to the next occurrence. Pending due dates are unchanged.'
          : rule.title);
        onSaved(rule);
      } else {
        const result = await adminApi.createRule({
          typeId, title: title.trim(), instructions, intervalValue, intervalUnit, active,
          firstDueDate: useCustomDue ? firstDueDate : null,
        });
        toaster.success(`"${result.rule.title}" added`, result.tasksOpened
          ? `${plural(result.tasksOpened, 'item')} of this type now has it scheduled.`
          : 'No equipment of this type yet — it will be scheduled as soon as you add some.');
        onSaved(result.rule);
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError({ field: err.field, message: err.message });
      else setError({ message: 'Could not save. Please try again.' });
    } finally { setBusy(false); }
  };

  const valid = title.trim() && typeId && intervalValue > 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit maintenance task' : 'New maintenance task'}
      subtitle={type ? `For every ${type.name.toLowerCase()}` : undefined}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={save}>
            {existing ? 'Save changes' : 'Add maintenance task'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        {!existing ? (
          <SelectField
            label="Applies to" required value={typeId} onChange={(e) => setTypeId(e.target.value)}
            options={types.map((t) => ({ value: t.id, label: `${t.name} — ${plural(t.equipmentCount, 'item')}` }))}
            hint="Every item of this type inherits it, each with its own schedule."
            error={error?.field === 'typeId' ? error.message : null}
          />
        ) : null}
        <TextField
          label="What needs doing" required autoFocus
          value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Replace air filters"
          error={error?.field === 'title' ? error.message : null}
        />
      </div>

      <TextArea
        label="Instructions" rows={5}
        value={instructions} onChange={(e) => setInstructions(e.target.value)}
        placeholder="Write it the way you would explain it to someone doing this for the first time."
        hint="Shown to the worker on their phone, right above the completion form."
      />

      <div className="cadence-picker">
        <span className="cadence-picker__label">How often</span>
        <div className="cadence-picker__presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`chip${intervalValue === p.value && intervalUnit === p.unit ? ' is-selected' : ''}`}
              onClick={() => { setIntervalValue(p.value); setIntervalUnit(p.unit); }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="cadence-picker__custom">
          <span>Every</span>
          <input
            type="number" min={1} max={9999} value={intervalValue} className="input input--number"
            aria-label="Interval value"
            onChange={(e) => setIntervalValue(Math.max(1, Math.min(9999, Number(e.target.value) || 1)))}
          />
          <div className="select-wrap select-wrap--inline">
            <select className="input input--select" aria-label="Interval unit" value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}>
              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
        </div>
        <p className="cadence-picker__echo">
          {cadence(intervalValue, intervalUnit)} — after each completion the next one falls due one interval
          from the day the work was actually done.
        </p>
      </div>

      <Switch
        label={active ? 'Active' : 'Deactivated'}
        description={active
          ? 'Appears in the worker app for every item of this type.'
          : 'Pending tasks are hidden and keep their dates. History is preserved.'}
        checked={active}
        onChange={setActive}
      />

      {existing && frequencyChanged ? (
        <div className="preview preview--warn">
          <p className="preview__title">Frequency change</p>
          <p className="preview__empty">
            Existing pending tasks keep the due dates they already have. The new interval takes effect from the
            next occurrence generated after a completion. To move a pending task now, reschedule it explicitly.
          </p>
        </div>
      ) : null}

      {!existing ? (
        <>
          <Switch
            label="Set the first due date myself"
            description={useCustomDue
              ? 'Every item of this type will first fall due on the date below.'
              : `By default the first occurrence falls due ${longDate(addInterval(today, intervalValue, intervalUnit))}.`}
            checked={useCustomDue}
            onChange={setUseCustomDue}
          />
          {useCustomDue ? (
            <TextField label="First due date" type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} />
          ) : null}
          {type ? (
            <div className="preview">
              <p className="preview__title">
                {type.equipmentCount
                  ? `${plural(type.equipmentCount, 'existing item')} will get this on the schedule`
                  : 'No equipment of this type yet'}
              </p>
              <p className="preview__empty">
                {type.equipmentCount
                  ? `Each keeps its own independent schedule, first due ${longDate(useCustomDue ? firstDueDate : addInterval(today, intervalValue, intervalUnit))}. No past completions are invented.`
                  : 'Add equipment of this type and it will pick this up automatically.'}
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      {error && !error.field ? <p className="form-error">{error.message}</p> : null}
    </Sheet>
  );
}
