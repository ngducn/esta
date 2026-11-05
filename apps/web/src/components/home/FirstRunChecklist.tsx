'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { useUndoableAction } from '@/components/use-undoable-action';
import { FormAlert } from '@/components/form-alert';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';
import { dismissFirstRun, restoreFirstRun } from '@/server/actions/first-run';

export type FirstRunChecklistLabels = {
  readonly title: string;
  readonly hide: string;
  readonly hidden: string;
  readonly hideFailed: string;
  readonly restoreFailed: string;
  readonly done: string;
};

export type FirstRunRow = { readonly id: string; readonly title: string; readonly action: string; readonly href: string; readonly done: boolean };

export function FirstRunChecklist({ rows, labels }: { rows: readonly FirstRunRow[]; labels: FirstRunChecklistLabels }) {
  const hydrated = useHydrated();
  const { pending, error, perform } = useUndoableAction({ failed: labels.hideFailed, restoreFailed: labels.restoreFailed });

  return (
    <section aria-labelledby="first-run-title" data-testid="first-run" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-card-pad shadow-xs">
      <header className="flex items-center justify-between gap-3">
        <h2 id="first-run-title" className="text-headline font-semibold text-text">
          {labels.title}
        </h2>
        <button
          type="button"
          data-testid="first-run-hide"
          disabled={pending || !hydrated}
          onClick={() => perform(dismissFirstRun, { message: labels.hidden, restore: restoreFirstRun })}
          className={cn(buttonVariants({ variant: 'ghost' }), 'min-h-touch px-2 text-body-sm')}
        >
          {labels.hide}
        </button>
      </header>
      <ol className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} data-testid="first-run-step" data-step={row.id} data-done={row.done} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
            <span
              aria-hidden="true"
              className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border', row.done ? 'border-accent bg-accent text-on-accent' : 'border-border')}
            >
              {row.done ? <Check className="size-4" strokeWidth={2.4} /> : null}
            </span>
            <span className={cn('min-w-0 flex-1 basis-40 text-body break-words', row.done ? 'text-text-muted' : 'text-text')}>
              {row.title}
              {row.done ? <span className="sr-only"> {labels.done}</span> : null}
            </span>
            {row.done ? null : (
              <Link href={row.href} data-testid="first-run-action" className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch shrink-0 px-3 text-body-sm')}>
                {row.action}
              </Link>
            )}
          </li>
        ))}
      </ol>
      <FormAlert message={error} />
    </section>
  );
}
