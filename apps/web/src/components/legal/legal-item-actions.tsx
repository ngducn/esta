'use client';

import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteLegalItem, restoreLegalItem } from '@/app/(app)/properties/[id]/legal/actions';
import { buttonVariants } from '@/components/ui/button-variants';
import { useUndoToast } from '@/components/undo-toast';
import type { LegalKind } from '@/server/properties/legal';

export type LegalItemActionLabels = {
  readonly edit: string;
  readonly editLabel: string;
  readonly delete: string;
  readonly deleteLabel: string;
  readonly deleting: string;
  readonly deleted: string;
  readonly deleteFailed: string;
  readonly restoreFailed: string;
};

/** Delete needs no confirm step: the toast's `Hoàn tác` puts the row back for 6 s, and a second tap changes nothing. */
export function LegalItemActions({ propertyId, kind, itemId, labels }: { propertyId: string; kind: LegalKind; itemId: string; labels: LegalItemActionLabels }) {
  const router = useRouter();
  const showUndo = useUndoToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = () =>
    startTransition(async () => {
      setError(null);
      const result = await deleteLegalItem(propertyId, kind, itemId).catch(() => ({ ok: false }) as const);
      if (!result.ok) {
        setError(labels.deleteFailed);
        return;
      }
      router.refresh();
      showUndo(labels.deleted, () => {
        restoreLegalItem(result.deleted)
          .then((restored) => (restored.ok ? router.refresh() : setError(labels.restoreFailed)))
          .catch(() => setError(labels.restoreFailed));
      });
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        <Link href={`/properties/${propertyId}/legal/${kind}/${itemId}`} aria-label={labels.editLabel} className={buttonVariants({ variant: 'outline' })}>
          <Pencil aria-hidden="true" />
          {labels.edit}
        </Link>
        <button type="button" onClick={remove} disabled={pending} aria-label={labels.deleteLabel} data-testid="delete-legal-item" className={buttonVariants({ variant: 'outline' })}>
          <Trash2 aria-hidden="true" />
          {pending ? labels.deleting : labels.delete}
        </button>
      </div>
      {error === null ? null : (
        <p role="alert" className="text-small text-overdue">
          {error}
        </p>
      )}
    </div>
  );
}
