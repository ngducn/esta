'use client';

import { Check } from 'lucide-react';
import { setTaskStatus } from '@/app/(app)/assistant/actions';
import { FormAlert } from '@/components/form-alert';
import { buttonVariants } from '@/components/ui/button-variants';
import { useUndoableAction } from '@/components/use-undoable-action';
import { useHydrated } from '@/lib/use-hydrated';

export type TaskDoneLabels = { readonly done: string; readonly doneLabel: string; readonly toast: string; readonly failed: string; readonly restoreFailed: string };

/** `Xong` marks the task done and offers undo, which opens it again. */
export function TaskDone({ id, labels }: { id: string; labels: TaskDoneLabels }) {
  const hydrated = useHydrated();
  const { pending, error, perform } = useUndoableAction({ failed: labels.failed, restoreFailed: labels.restoreFailed });
  const done = () => perform(() => setTaskStatus({ id, status: 'done' }), { message: labels.toast, restore: () => setTaskStatus({ id, status: 'open' }) });
  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={done} disabled={pending || !hydrated} aria-label={labels.doneLabel} data-testid="task-done" className={buttonVariants({ variant: 'quiet' })}>
        <Check aria-hidden="true" />
        {labels.done}
      </button>
      <FormAlert message={error} />
    </div>
  );
}
