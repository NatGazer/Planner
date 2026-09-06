import { useEffect, useMemo, useState, useRef } from 'react';
import { Sheet } from '@ui/components/Sheet';
import { Button } from '@ui/components/Button';
import { SelectField, Switch, TextArea, TextField } from '@ui/components/Field';
import { useToaster } from '@ui/components/Toaster';
import { ApiError } from '@ui/lib/api';
import { errorMessage } from '@ui/lib/errors';
import { useT, type StringKey } from '@ui/lib/i18n';
import { addInterval, cadence, longDate, shiftDate } from '@ui/lib/format';
import type { EquipmentType, IntervalUnit, MaintenanceRule } from '@ui/lib/types';
import { adminApi } from '../data';

// Both lists are module-level, so they hold *keys*; the words are resolved
// with `t` inside the component, where the language is known.
const UNITS: { value: IntervalUnit; labelKey: StringKey }[] = [
  { value: 'days', labelKey: 'unit.days' },
  { value: 'weeks', labelKey: 'unit.weeks' },
  { value: 'months', labelKey: 'unit.months' },
  { value: 'years', labelKey: 'unit.years' },
];

const PRESETS: { labelKey: StringKey; value: number; unit: IntervalUnit }[] = [
  { labelKey: 'admin.ruleForm.preset.weekly', value: 1, unit: 'weeks' },
  { labelKey: 'admin.ruleForm.preset.fortnightly', value: 2, unit: 'weeks' },
  { labelKey: 'admin.ruleForm.preset.monthly', value: 1, unit: 'months' },
  { labelKey: 'admin.ruleForm.preset.quarterly', value: 3, unit: 'months' },
  { labelKey: 'admin.ruleForm.preset.twiceAYear', value: 6, unit: 'months' },
  { labelKey: 'admin.ruleForm.preset.yearly', value: 1, unit: 'years' },
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
  const t = useT();
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

  /**
   * Fill once per opening. `types`/`today` are read through a ref rather than
   * depended on, because they arrive from a fetch that can land while somebody
   * is already typing — and re-running this would erase their work.
   */
  const latest = useRef({ types, today });
  latest.current = { types, today };

  useEffect(() => {
    if (!open) return;
    const { types: list, today: d } = latest.current;
    setTypeId(existing?.type.id ?? defaultTypeId ?? list[0]?.id ?? '');
    setTitle(existing?.title ?? '');
    setInstructions(existing?.instructions ?? '');
    setIntervalValue(existing?.intervalValue ?? 3);
    setIntervalUnit(existing?.intervalUnit ?? 'months');
    setActive(existing ? existing.active : true);
    setUseCustomDue(false);
    setFirstDueDate(shiftDate(d, 7));
    setError(null);
  }, [open, existing, defaultTypeId]);

  useEffect(() => {
    if (!open || typeId || !types.length) return;
    setTypeId(defaultTypeId ?? types[0].id);
  }, [open, typeId, types, defaultTypeId]);

  useEffect(() => {
    if (!open || firstDueDate || !today) return;
    setFirstDueDate(shiftDate(today, 7));
  }, [open, firstDueDate, today]);

  const type = useMemo(() => types.find((et) => et.id === typeId) ?? null, [types, typeId]);
  const frequencyChanged = !!existing && (existing.intervalValue !== intervalValue || existing.intervalUnit !== intervalUnit);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (existing) {
        const { rule } = await adminApi.updateRule(existing.id, {
          title: title.trim(), instructions, intervalValue, intervalUnit, active,
        });
        toaster.success(t('admin.ruleForm.toast.updated'), frequencyChanged
          ? t('admin.ruleForm.toast.frequencyBody')
          : rule.title);
        onSaved(rule);
      } else {
        const result = await adminApi.createRule({
          typeId, title: title.trim(), instructions, intervalValue, intervalUnit, active,
          firstDueDate: useCustomDue ? firstDueDate : null,
        });
        toaster.success(t('admin.ruleForm.toast.added', { title: result.rule.title }), result.tasksOpened
          ? t('admin.ruleForm.toast.scheduled', { count: result.tasksOpened })
          : t('admin.ruleForm.toast.noEquipment'));
        onSaved(result.rule);
      }
      onClose();
    } catch (err) {
      setError({
        field: err instanceof ApiError ? err.field : undefined,
        message: errorMessage(t, err, 'admin.ruleForm.saveFailed'),
      });
    } finally { setBusy(false); }
  };

  const valid = title.trim() && typeId && intervalValue > 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? t('admin.ruleForm.title.edit') : t('admin.ruleForm.title.new')}
      subtitle={type ? t('admin.ruleForm.subtitle', { type: type.name.toLowerCase() }) : undefined}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={save}>
            {existing ? t('admin.ruleForm.saveChanges') : t('admin.ruleForm.submit')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        {!existing ? (
          <SelectField
            label={t('admin.ruleForm.appliesTo')} required value={typeId} onChange={(e) => setTypeId(e.target.value)}
            options={types.map((et) => ({ value: et.id, label: t('admin.ruleForm.typeOption', { name: et.name, count: et.equipmentCount }) }))}
            hint={t('admin.ruleForm.appliesToHint')}
            error={error?.field === 'typeId' ? error.message : null}
          />
        ) : null}
        <TextField
          label={t('admin.ruleForm.titleField')} required autoFocus
          value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={t('admin.ruleForm.titlePlaceholder')}
          error={error?.field === 'title' ? error.message : null}
        />
      </div>

      <TextArea
        label={t('admin.ruleForm.instructions')} rows={5}
        value={instructions} onChange={(e) => setInstructions(e.target.value)}
        placeholder={t('admin.ruleForm.instructionsPlaceholder')}
        hint={t('admin.ruleForm.instructionsHint')}
      />

      <div className="cadence-picker">
        <span className="cadence-picker__label">{t('admin.ruleForm.howOften')}</span>
        <div className="cadence-picker__presets">
          {PRESETS.map((p) => (
            <button
              key={p.labelKey}
              type="button"
              className={`chip${intervalValue === p.value && intervalUnit === p.unit ? ' is-selected' : ''}`}
              onClick={() => { setIntervalValue(p.value); setIntervalUnit(p.unit); }}
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>
        <div className="cadence-picker__custom">
          <span>{t('admin.ruleForm.everyPrefix')}</span>
          <input
            type="number" min={1} max={9999} value={intervalValue} className="input input--number"
            aria-label={t('admin.ruleForm.intervalValue')}
            onChange={(e) => setIntervalValue(Math.max(1, Math.min(9999, Number(e.target.value) || 1)))}
          />
          <div className="select-wrap select-wrap--inline">
            <select className="input input--select" aria-label={t('admin.ruleForm.intervalUnit')} value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}>
              {UNITS.map((u) => <option key={u.value} value={u.value}>{t(u.labelKey)}</option>)}
            </select>
          </div>
        </div>
        <p className="cadence-picker__echo">
          {t('admin.ruleForm.cadenceEcho', { cadence: cadence(intervalValue, intervalUnit) })}
        </p>
      </div>

      <Switch
        label={active ? t('admin.ruleForm.active') : t('admin.ruleForm.deactivated')}
        description={active
          ? t('admin.ruleForm.activeHint')
          : t('admin.ruleForm.deactivatedHint')}
        checked={active}
        onChange={setActive}
      />

      {existing && frequencyChanged ? (
        <div className="preview preview--warn">
          <p className="preview__title">{t('admin.ruleForm.frequencyChange')}</p>
          <p className="preview__empty">
            {t('admin.ruleForm.frequencyChangeBody')}
          </p>
        </div>
      ) : null}

      {!existing ? (
        <>
          <Switch
            label={t('admin.ruleForm.customDue')}
            description={useCustomDue
              ? t('admin.ruleForm.customDueOn')
              : t('admin.ruleForm.customDueOff', { date: longDate(addInterval(today, intervalValue, intervalUnit)) })}
            checked={useCustomDue}
            onChange={setUseCustomDue}
          />
          {useCustomDue ? (
            <TextField label={t('admin.ruleForm.firstDueDate')} type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} />
          ) : null}
          {type ? (
            <div className="preview">
              <p className="preview__title">
                {type.equipmentCount
                  ? t('admin.ruleForm.previewCount', { count: type.equipmentCount })
                  : t('admin.ruleForm.previewNone')}
              </p>
              <p className="preview__empty">
                {type.equipmentCount
                  ? t('admin.ruleForm.previewBody', { date: longDate(useCustomDue ? firstDueDate : addInterval(today, intervalValue, intervalUnit)) })
                  : t('admin.ruleForm.previewNoneBody')}
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      {error && !error.field ? <p className="form-error">{error.message}</p> : null}
    </Sheet>
  );
}
