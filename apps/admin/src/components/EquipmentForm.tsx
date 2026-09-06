import { useEffect, useMemo, useState, useRef } from 'react';
import { Sheet } from '@ui/components/Sheet';
import { Button } from '@ui/components/Button';
import { SelectField, Switch, TextField } from '@ui/components/Field';
import { useToaster } from '@ui/components/Toaster';
import { ApiError } from '@ui/lib/api';
import { errorMessage } from '@ui/lib/errors';
import { useT } from '@ui/lib/i18n';
import { addInterval, longDate, shiftDate } from '@ui/lib/format';
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
  const t = useT();
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

  /**
   * Fill the form once per opening, and *only* then. The deliberate omission
   * from the dependency list is `types`/`today`: those arrive from a live
   * fetch that can land a second after the sheet opens, and re-running this
   * effect would wipe out whatever has been typed in the meantime. Their
   * latest values are read through a ref instead.
   */
  const latest = useRef({ types, today });
  latest.current = { types, today };

  useEffect(() => {
    if (!open) return;
    const { types: list, today: d } = latest.current;
    setCode(existing?.code ?? '');
    setName(existing?.name ?? '');
    setTypeId(existing?.type.id ?? defaultTypeId ?? list[0]?.id ?? '');
    setLocation(existing?.location ?? '');
    setActive(existing ? existing.active : true);
    setUseCustomDue(false);
    setFirstDueDate(shiftDate(d, 7));
    setError(null);
  }, [open, existing, defaultTypeId]);

  // A type could not be pre-selected because the list had not arrived yet.
  // Adopt a default the moment it does — without touching anything else.
  useEffect(() => {
    if (!open || typeId || !types.length) return;
    setTypeId(defaultTypeId ?? types[0].id);
  }, [open, typeId, types, defaultTypeId]);

  // Same for the suggested first due date: filled in only while untouched.
  useEffect(() => {
    if (!open || firstDueDate || !today) return;
    setFirstDueDate(shiftDate(today, 7));
  }, [open, firstDueDate, today]);

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
        toaster.success(
          t('admin.equipmentForm.toast.updated'),
          t('admin.equipmentForm.toast.updatedBody', { code: equipment.code, name: equipment.name }),
        );
        onSaved(equipment);
      } else {
        const result = await adminApi.createEquipment({
          code: code.trim(), name: name.trim(), typeId, location: location.trim() || undefined, active,
          firstDueDate: useCustomDue ? firstDueDate : null,
        });
        toaster.success(
          t('admin.equipmentForm.toast.added', { code: result.equipment.code }),
          result.tasksOpened
            ? t('admin.equipmentForm.toast.tasksScheduled', { count: result.tasksOpened })
            : t('admin.equipmentForm.toast.noTasks'),
        );
        onSaved(result.equipment);
      }
      onClose();
    } catch (err) {
      setError({ field: err instanceof ApiError ? err.field : undefined, message: errorMessage(t, err) });
    } finally {
      setBusy(false);
    }
  };

  const valid = code.trim() && name.trim() && typeId;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? t('admin.equipmentForm.edit') : t('admin.equipmentForm.add')}
      subtitle={existing ? existing.code : t('admin.equipmentForm.subtitle')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={save}>
            {existing ? t('admin.equipmentForm.save') : t('admin.equipmentForm.add')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <TextField
          label={t('admin.equipmentForm.code')} required autoFocus
          value={code} onChange={(e) => setCode(e.target.value)}
          placeholder={t('admin.equipmentForm.code.placeholder')}
          hint={t('admin.equipmentForm.code.hint')}
          error={error?.field === 'code' ? error.message : null}
        />
        <TextField
          label={t('admin.equipmentForm.name')} required
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t('admin.equipmentForm.name.placeholder')}
        />
        <SelectField
          label={t('admin.equipmentForm.type')} required
          value={typeId} onChange={(e) => setTypeId(e.target.value)}
          options={types.map((type) => ({ value: type.id, label: type.name }))}
          hint={existing && existing.type.id !== typeId
            ? t('admin.equipmentForm.type.hintChanging')
            : t('admin.equipmentForm.type.hint')}
          error={error?.field === 'typeId' ? error.message : null}
        />
        <TextField
          label={t('admin.equipmentForm.location')}
          value={location} onChange={(e) => setLocation(e.target.value)}
          placeholder={t('admin.equipmentForm.location.placeholder')}
          hint={t('admin.equipmentForm.location.hint')}
        />
      </div>

      <Switch
        label={active ? t('admin.equipmentForm.active.on') : t('admin.equipmentForm.active.off')}
        description={active
          ? t('admin.equipmentForm.active.onHint')
          : t('admin.equipmentForm.active.offHint')}
        checked={active}
        onChange={setActive}
      />

      {!existing ? (
        <>
          <Switch
            label={t('admin.equipmentForm.customDue')}
            description={useCustomDue
              ? t('admin.equipmentForm.customDue.onHint')
              : t('admin.equipmentForm.customDue.offHint')}
            checked={useCustomDue}
            onChange={setUseCustomDue}
          />
          {useCustomDue ? (
            <TextField label={t('admin.equipmentForm.firstDue')} type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} />
          ) : null}

          <div className="preview">
            <p className="preview__title">
              {inherited.length
                ? t('admin.equipmentForm.preview.inherits', { count: inherited.length })
                : t('admin.equipmentForm.preview.emptyTitle')}
            </p>
            {inherited.length ? (
              <ul className="preview__list">
                {inherited.map((r) => (
                  <li key={r.id}>
                    <span className="preview__rule">{r.title}</span>
                    <span className="preview__due">
                      {t('admin.equipmentForm.preview.firstDue', {
                        date: longDate(useCustomDue ? firstDueDate : addInterval(today, r.intervalValue, r.intervalUnit)),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="preview__empty">{t('admin.equipmentForm.preview.emptyHint')}</p>
            )}
          </div>
        </>
      ) : null}

      {error && !error.field ? <p className="form-error">{error.message}</p> : null}
    </Sheet>
  );
}
