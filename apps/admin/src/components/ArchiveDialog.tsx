import { useState } from 'react';
import { Sheet } from '@ui/components/Sheet';
import { Button } from '@ui/components/Button';
import { Icon } from '@ui/components/Icon';
import { useToaster } from '@ui/components/Toaster';
import { ApiError } from '@ui/lib/api';
import { plural } from '@ui/lib/format';

export interface ArchiveDialogProps {
  open: boolean;
  onClose: () => void;
  /** What is being archived, in the words the administrator uses. */
  kind: 'equipment' | 'maintenance task' | 'equipment type';
  label: string;
  completionCount: number;
  pendingCount: number;
  archive: () => Promise<unknown>;
  onDone: () => void;
}

/**
 * Archiving, said plainly.
 *
 * Nothing in this system is ever deleted, because completed history points at
 * it. The dialog says exactly that, in the specific numbers for this item, so
 * an administrator is never guessing what "archive" will cost them.
 */
export function ArchiveDialog({ open, onClose, kind, label, completionCount, pendingCount, archive, onDone }: ArchiveDialogProps) {
  const toaster = useToaster();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await archive();
      toaster.success(`${label} archived`, 'Its completed history is untouched and still readable.');
      onDone();
      onClose();
    } catch (err) {
      toaster.error('Could not archive', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Archive ${label}?`}
      subtitle={`This ${kind} will no longer appear anywhere you configure work.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Keep it</Button>
          <Button variant="danger" icon="archive" loading={busy} onClick={run}>Archive</Button>
        </>
      }
    >
      <ul className="archive-facts">
        <li>
          <Icon name="checkCircle" size={15} />
          <span>
            <strong>{plural(completionCount, 'completed record')}</strong> stay exactly as they are.
            Each one carries its own copy of the details, so archiving cannot change what they say.
          </span>
        </li>
        <li>
          <Icon name="calendar" size={15} />
          <span>
            <strong>{plural(pendingCount, 'pending task')}</strong> will be hidden. They are not deleted.
          </span>
        </li>
        <li>
          <Icon name="info" size={15} />
          <span>Nothing is removed from the database. Archiving is how this system retires
            something that history still points at.</span>
        </li>
      </ul>
    </Sheet>
  );
}
