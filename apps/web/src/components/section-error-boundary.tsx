'use client';

import { RotateCw, TriangleAlert } from 'lucide-react';
import { catchError } from 'next/error';
import { buttonVariants } from '@/components/ui/button-variants';

type ErrorLabels = { title: string; body: string; retry: string };

/**
 * A component boundary instead of `error.tsx`: Next loads a segment's `error.tsx` as its own chunk once hydration
 * starts, a request chained after the framework chunk inside the cover's LCP window. This one ships with the layout.
 */
export const SectionErrorBoundary = catchError<{ labels: ErrorLabels }>(function SectionError({ labels }, { retry }) {
  return (
    <section role="alert" className="flex max-w-3xl flex-col items-start gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <h1 className="flex items-center gap-3 text-lead font-semibold text-ink">
        <TriangleAlert className="size-6 shrink-0 text-overdue" aria-hidden="true" />
        {labels.title}
      </h1>
      <p className="text-body text-ink-2">{labels.body}</p>
      <button type="button" className={buttonVariants({ variant: 'outline' })} onClick={retry}>
        <RotateCw aria-hidden="true" />
        {labels.retry}
      </button>
    </section>
  );
});
