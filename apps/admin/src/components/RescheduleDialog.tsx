import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@ui/components/Sheet';
import { Button } from '@ui/components/Button';
import { TextArea, TextField } from '@ui/components/Field';
import { useToaster } from '@ui/components/Toaster';
import { errorMessage } from '@ui/lib/errors';
import { useT, type StringKey } from '@ui/lib/i18n';
import { longDate, shiftDate } from '@ui/lib/format';
import { dueLabel, STATUS } from '@ui/lib/status';
import type { Task } from '@ui/lib/types';
import { adminApi } from '../data';

export interface RescheduleDialogProps {
  task: Task | null;
  today: string;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Moving a pending occurrence. Deliberately explicit about what it does and
 * does not change, because rescheduling is the one place an administrator can
 * reach into a running schedule by hand — and it is always audited.
 */
export function RescheduleDialog({ task, today, onClose, onDone }: RescheduleDialogProps) {
  const t = useT();
  const toaster = useToaster();
  const [dueDate, setDueDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // The dialog stays mounted between openings, so a date and a reason typed
  // for one task would otherwise still be sitting there for the next one —
  // a pre-filled form that quietly moves the wrong occurrence. Every opening
  // starts blank, whether the last one was saved or cancelled.
  useEffect(() => { setDueDate(''); setReason(''); }, [task?.id]);

  const current = task?.dueDate ?? '';
  const value = dueDate || current;

  // The chips hold *keys*; the words are resolved with `t` where they render,
  // so the list does not have to be rebuilt when the language changes.
  const shortcuts = useMemo<{ labelKey: StringKey; value: string }[]>(() => (today ? [
    { labelKey: 'admin.reschedule.shortcut.today', value: today },
    { labelKey: 'admin.reschedule.shortcut.tomorrow', value: shiftDate(today, 1) },
    { labelKey: 'admin.reschedule.shortcut.week', value: shiftDate(today, 7) },
    { labelKey: 'admin.reschedule.shortcut.month', value: shiftDate(today, 30) },
  ] : []), [today]);

  const submit = async () => {
    if (!task) return;
    setBusy(true);
    try {
      const result = await adminApi.reschedule(task.id, value, reason.trim() || undefined);
      if (result.changed) {
        toaster.success(
          t('admin.reschedule.toast.done'),
          t('admin.reschedule.toast.doneBody', {
            rule: task.rule.title, equipment: task.equipment.code, date: longDate(value),
          }),
        );
      } else {
        // The server left it alone — the date was already this, or the task
        // was completed while the dialog was open. Saying "rescheduled" here
        // would be a lie the activity log would then contradict.
        toaster.info(t('admin.reschedule.toast.noChange'), t('admin.reschedule.toast.noChangeBody'));
      }
      setDueDate(''); setReason('');
      onDone();
    } catch (err) {
      toaster.error(t('admin.reschedule.toast.failed'), errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={!!task}
      onClose={onClose}
      title={t('admin.reschedule.title')}
      subtitle={task ? `${task.rule.title} · ${task.equipment.code}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!value || value === current} onClick={submit}>
            {t('admin.reschedule.confirm')}
          </Button>
        </>
      }
    >
      <p className="reschedule__current">
        {t('admin.reschedule.currentlyDue', { date: current ? longDate(current) : '—' })}
        {task ? <> · <span className={STATUS[task.due.bucket].className}>{dueLabel(t, task.due)}</span></> : null}
      </p>

      <div className="reschedule__shortcuts">
        {shortcuts.map((s) => (
          <button key={s.labelKey} type="button" className={`chip${value === s.value ? ' is-selected' : ''}`} onClick={() => setDueDate(s.value)}>
            {t(s.labelKey)}
          </button>
        ))}
      </div>

      <TextField label={t('admin.reschedule.newDate')} type="date" value={value} min="2000-01-01" max="2099-12-31" onChange={(e) => setDueDate(e.target.value)} />
      <TextArea
        label={t('admin.reschedule.reason')} rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder={t('admin.reschedule.reason.placeholder')}
        hint={t('admin.reschedule.reason.hint')}
      />

      <p className="sheet__note">
        {t('admin.reschedule.note')}
      </p>
    </Sheet>
  );
}
