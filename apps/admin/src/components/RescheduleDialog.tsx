import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@ui/components/Sheet';
import { Button } from '@ui/components/Button';
import { TextArea, TextField } from '@ui/components/Field';
import { useToaster } from '@ui/components/Toaster';
import { ApiError } from '@ui/lib/api';
import { longDate, shiftDate } from '@ui/lib/format';
import { STATUS } from '@ui/lib/status';
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

  const shortcuts = useMemo(() => (today ? [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: shiftDate(today, 1) },
    { label: 'In a week', value: shiftDate(today, 7) },
    { label: 'In a month', value: shiftDate(today, 30) },
  ] : []), [today]);

  const submit = async () => {
    if (!task) return;
    setBusy(true);
    try {
      const result = await adminApi.reschedule(task.id, value, reason.trim() || undefined);
      if (result.changed) {
        toaster.success('Task rescheduled', `${task.rule.title} on ${task.equipment.code} now falls due ${longDate(value)}.`);
      } else {
        // The server left it alone — the date was already this, or the task
        // was completed while the dialog was open. Saying "rescheduled" here
        // would be a lie the activity log would then contradict.
        toaster.info('Nothing to change', 'That task is already due on this date, or it has just been completed.');
      }
      setDueDate(''); setReason('');
      onDone();
    } catch (err) {
      toaster.error('Could not reschedule', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={!!task}
      onClose={onClose}
      title="Reschedule this task"
      subtitle={task ? `${task.rule.title} · ${task.equipment.code}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!value || value === current} onClick={submit}>
            Move this occurrence
          </Button>
        </>
      }
    >
      <p className="reschedule__current">
        Currently due <strong>{current ? longDate(current) : '—'}</strong>
        {task ? <> · <span className={STATUS[task.due.bucket].className}>{task.due.label}</span></> : null}
      </p>

      <div className="reschedule__shortcuts">
        {shortcuts.map((s) => (
          <button key={s.label} type="button" className={`chip${value === s.value ? ' is-selected' : ''}`} onClick={() => setDueDate(s.value)}>
            {s.label}
          </button>
        ))}
      </div>

      <TextField label="New due date" type="date" value={value} min="2000-01-01" max="2099-12-31" onChange={(e) => setDueDate(e.target.value)} />
      <TextArea
        label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="Parts on order, contractor unavailable, site closed…"
        hint="Optional — but it is what makes the activity log worth reading later."
      />

      <p className="sheet__note">
        This moves only this occurrence, on this one item. Once the work is completed, the following occurrence is
        still calculated from the day it was actually done.
      </p>
    </Sheet>
  );
}
