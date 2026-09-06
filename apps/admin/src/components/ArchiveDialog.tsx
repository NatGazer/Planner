import { useState } from 'react';
import { Sheet } from '@ui/components/Sheet';
import { Button } from '@ui/components/Button';
import { Icon } from '@ui/components/Icon';
import { useToaster } from '@ui/components/Toaster';
import { errorMessage } from '@ui/lib/errors';
import { useT, type StringKey } from '@ui/lib/i18n';

export interface ArchiveDialogProps {
  open: boolean;
  onClose: () => void;
  /** What is being archived. It picks a whole sentence, not a word slotted into one. */
  kind: 'equipment' | 'maintenance task' | 'equipment type';
  label: string;
  completionCount: number;
  pendingCount: number;
  archive: () => Promise<unknown>;
  onDone: () => void;
}

/**
 * One subtitle per kind. The noun cannot be a parameter: "this equipment" and
 * "this maintenance task" do not share a determiner in French or Portuguese.
 */
const SUBTITLE: Record<ArchiveDialogProps['kind'], StringKey> = {
  equipment: 'admin.archive.subtitle.equipment',
  'maintenance task': 'admin.archive.subtitle.rule',
  'equipment type': 'admin.archive.subtitle.type',
};

/**
 * Archiving, said plainly.
 *
 * Nothing in this system is ever deleted, because completed history points at
 * it. The dialog says exactly that, in the specific numbers for this item, so
 * an administrator is never guessing what "archive" will cost them.
 */
export function ArchiveDialog({ open, onClose, kind, label, completionCount, pendingCount, archive, onDone }: ArchiveDialogProps) {
  const t = useT();
  const toaster = useToaster();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await archive();
      toaster.success(t('admin.archive.done', { name: label }), t('admin.archive.doneBody'));
      onDone();
      onClose();
    } catch (err) {
      toaster.error(t('admin.archive.failed'), errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('admin.archive.title', { name: label })}
      subtitle={t(SUBTITLE[kind])}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('admin.archive.keep')}</Button>
          <Button variant="danger" icon="archive" loading={busy} onClick={run}>{t('admin.archive.confirm')}</Button>
        </>
      }
    >
      <ul className="archive-facts">
        <li>
          <Icon name="checkCircle" size={15} />
          <span>
            <strong>{t('admin.archive.records', { count: completionCount })}</strong>{' '}
            {t('admin.archive.recordsWhy', { count: completionCount })}
          </span>
        </li>
        <li>
          <Icon name="calendar" size={15} />
          <span>
            <strong>{t('admin.archive.pending', { count: pendingCount })}</strong>{' '}
            {t('admin.archive.pendingKept', { count: pendingCount })}
          </span>
        </li>
        <li>
          <Icon name="info" size={15} />
          <span>{t('admin.archive.nothingDeleted')}</span>
        </li>
      </ul>
    </Sheet>
  );
}
