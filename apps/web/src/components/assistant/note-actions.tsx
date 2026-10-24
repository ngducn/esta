'use client';

import { Check, EyeOff } from 'lucide-react';
import { setNoteStatus } from '@/app/(app)/assistant/actions';
import { FormAlert } from '@/components/form-alert';
import { buttonVariants } from '@/components/ui/button-variants';
import { useUndoableAction } from '@/components/use-undoable-action';
import { useHydrated } from '@/lib/use-hydrated';
import type { InboxStatus } from '@/server/agent/items';

export type NoteActionLabels = {
  readonly markRead: string;
  readonly markReadLabel: string;
  readonly dismiss: string;
  readonly dismissLabel: string;
  readonly dismissed: string;
  readonly failed: string;
  readonly restoreFailed: string;
};

const button = buttonVariants({ variant: 'outline' });

/** `Đã đọc` updates the card in place; `Ẩn` takes it off the list, and `Hoàn tác` puts it back as it was, read or unread. */
export function NoteActions({ id, status, labels }: { id: string; status: InboxStatus; labels: NoteActionLabels }) {
  const hydrated = useHydrated();
  const { pending, error, perform } = useUndoableAction({ failed: labels.failed, restoreFailed: labels.restoreFailed });
  const disabled = pending || !hydrated;
  const markRead = () => perform(() => setNoteStatus({ id, status: 'read' }));
  const dismiss = () => perform(() => setNoteStatus({ id, status: 'dismissed' }), { message: labels.dismissed, restore: () => setNoteStatus({ id, status }) });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === 'new' ? (
          <button type="button" onClick={markRead} disabled={disabled} aria-label={labels.markReadLabel} data-testid="note-read" className={button}>
            <Check aria-hidden="true" />
            {labels.markRead}
          </button>
        ) : null}
        <button type="button" onClick={dismiss} disabled={disabled} aria-label={labels.dismissLabel} data-testid="note-dismiss" className={button}>
          <EyeOff aria-hidden="true" />
          {labels.dismiss}
        </button>
      </div>
      <FormAlert message={error} />
    </div>
  );
}
