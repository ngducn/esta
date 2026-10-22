'use client';

import { formatDate } from '@esta/core/format';
import type { Valuation } from '@esta/core/valuations';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { lazy, Suspense, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useNoticeToast, useUndoToast } from '@/components/undo-toast';
import { useDeferredDialog } from '@/components/use-deferred-dialog';
import { createValuation, deleteValuation } from '@/server/actions/valuations';
import type { ValuationScope } from './valuation-sheet';

const loadSheet = () => import('./valuation-sheet');
const ValuationIsland = lazy(loadSheet);

/** `Thêm định giá`. Each opening mounts a fresh sheet, so each save carries its own id. */
export function AddValuation({ label, scope }: { label: string; scope: ValuationScope }) {
  const sheet = useDeferredDialog(loadSheet);
  const [opening, setOpening] = useState(0);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        data-testid="add-valuation"
        className="self-start"
        {...sheet.triggerProps}
        onClick={() => {
          setOpening((count) => count + 1);
          sheet.triggerProps.onClick();
        }}
      >
        <Plus aria-hidden="true" />
        {label}
      </Button>
      {sheet.open === null ? null : (
        <Suspense fallback={null}>
          <ValuationIsland key={opening} scope={scope} open={sheet.open} onOpenChange={sheet.setOpen} finalFocus={sheet.triggerProps.ref} />
        </Suspense>
      )}
    </>
  );
}

export type RemoveLabels = { readonly delete: string; readonly deleteLabel: string; readonly deleted: string; readonly restored: string; readonly failed: string; readonly undoFailed: string };

/** Deletes at once; `Hoàn tác` records the same valuation again under its id, as the sheet would. */
export function RemoveValuation({ valuation, labels }: { valuation: Valuation; labels: RemoveLabels }) {
  const router = useRouter();
  const showUndo = useUndoToast();
  const showNotice = useNoticeToast();
  const [pending, startTransition] = useTransition();
  const restore = () =>
    createValuation({
      id: valuation.id,
      propertyId: valuation.propertyId,
      method: valuation.method,
      value: String(valuation.valueVnd),
      asOf: formatDate(valuation.asOf, 'vi'),
      sourceUrl: valuation.sourceUrl ?? '',
      note: valuation.note ?? '',
    })
      .then((restored) => {
        router.refresh();
        showNotice(restored.ok ? labels.restored : labels.undoFailed);
      })
      .catch(() => showNotice(labels.undoFailed));
  const remove = () =>
    startTransition(async () => {
      const removed = await deleteValuation({ id: valuation.id }).catch(() => null);
      if (removed?.ok !== true) {
        showNotice(labels.failed);
        return;
      }
      router.refresh();
      showUndo(labels.deleted, () => void restore());
    });
  return (
    <Button type="button" variant="quiet" data-testid="remove-valuation" aria-label={labels.deleteLabel} disabled={pending} onClick={remove} className="px-2 text-overdue">
      <Trash2 aria-hidden="true" />
      {labels.delete}
    </Button>
  );
}
