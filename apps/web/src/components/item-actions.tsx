'use client';

import type { Result } from '@esta/core/result';
import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { FormAlert } from '@/components/form-alert';
import { buttonVariants } from '@/components/ui/button-variants';
import { useUndoableAction } from '@/components/use-undoable-action';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';

export type ItemActionLabels = {
  readonly edit: string;
  readonly editLabel: string;
  readonly delete: string;
  readonly deleteLabel: string;
  readonly deleting: string;
  readonly deleted: string;
  readonly deleteFailed: string;
  readonly restoreFailed: string;
};

type ItemActionsProps<Deleted> = {
  readonly editHref: string;
  /** Deletes the row and returns what `restore` needs to put it back. */
  readonly remove: () => Promise<Result<Deleted>>;
  readonly restore: (deleted: Deleted) => Promise<{ readonly ok: boolean }>;
  readonly labels: ItemActionLabels;
  readonly compact?: boolean;
};

const compactButton = 'min-h-touch px-3 text-small';

/**
 * `Sửa` and `Xóa` on one item. Delete needs no confirm step: the toast's `Hoàn tác` puts the row back for 6 s, and a second
 * tap changes nothing. It stays disabled until hydration, so a tap before the click handler exists does nothing.
 */
export function ItemActions<Deleted>({ editHref, remove, restore, labels, compact = false }: ItemActionsProps<Deleted>) {
  const hydrated = useHydrated();
  const { pending, error, perform } = useUndoableAction({ failed: labels.deleteFailed, restoreFailed: labels.restoreFailed });
  const button = cn(buttonVariants({ variant: 'outline' }), compact && compactButton);
  const onDelete = () => perform(remove, { message: labels.deleted, restore });

  return (
    <div className={cn('flex flex-col gap-1', compact ? 'sm:items-end' : 'items-end')}>
      <div className={cn('flex flex-wrap gap-2', !compact && 'justify-end')}>
        <Link href={editHref} aria-label={labels.editLabel} className={button}>
          <Pencil aria-hidden="true" />
          {labels.edit}
        </Link>
        <button type="button" onClick={onDelete} disabled={pending || !hydrated} aria-label={labels.deleteLabel} data-testid="delete-item" className={button}>
          <Trash2 aria-hidden="true" />
          {pending ? labels.deleting : labels.delete}
        </button>
      </div>
      <FormAlert message={error} />
    </div>
  );
}
