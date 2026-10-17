'use client';

import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteAccount, restoreAccount } from '@/app/(app)/properties/[id]/rental/actions';
import { buttonVariants } from '@/components/ui/button-variants';
import { useUndoToast } from '@/components/undo-toast';
import { cn } from '@/lib/utils';

export type AccountActionLabels = {
  readonly edit: string;
  readonly editLabel: string;
  readonly delete: string;
  readonly deleteLabel: string;
  readonly deleting: string;
  readonly deleted: string;
  readonly deleteFailed: string;
  readonly restoreFailed: string;
};

const small = 'min-h-touch px-3 text-small';

/** Delete needs no confirm step: the toast's `Hoàn tác` puts the account back for 6 s. */
export function AccountActions({ propertyId, accountId, labels }: { propertyId: string; accountId: string; labels: AccountActionLabels }) {
  const router = useRouter();
  const showUndo = useUndoToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = () =>
    startTransition(async () => {
      setError(null);
      const result = await deleteAccount(propertyId, accountId).catch(() => ({ ok: false }) as const);
      if (!result.ok) {
        setError(labels.deleteFailed);
        return;
      }
      router.refresh();
      showUndo(labels.deleted, () => {
        restoreAccount(result.deleted)
          .then((restored) => (restored.ok ? router.refresh() : setError(labels.restoreFailed)))
          .catch(() => setError(labels.restoreFailed));
      });
    });

  return (
    <div className="flex flex-col gap-1 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <Link href={`/properties/${propertyId}/rental/accounts/${accountId}`} aria-label={labels.editLabel} className={cn(buttonVariants({ variant: 'outline' }), small)}>
          <Pencil aria-hidden="true" />
          {labels.edit}
        </Link>
        <button type="button" onClick={remove} disabled={pending} aria-label={labels.deleteLabel} className={cn(buttonVariants({ variant: 'outline' }), small)}>
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
