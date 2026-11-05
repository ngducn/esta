'use client';

import { RotateCw, TriangleAlert } from 'lucide-react';
import { catchError } from 'next/error';
import { buttonVariants } from '@/components/ui/button-variants';

type ErrorLabels = { title: string; body: string; retry: string; page?: string };

/**
 * A component boundary instead of `error.tsx`: Next loads a segment's `error.tsx` as its own chunk once hydration
 * starts, a request chained after the framework chunk inside the cover's LCP window. This one ships with the layout.
 */
export const SectionErrorBoundary = catchError<{ labels: ErrorLabels }>(function SectionError({ labels }, { retry }) {
  const Title = labels.page === undefined ? 'h1' : 'h2';
  const card = (
    <section role="alert" className="flex max-w-3xl flex-col items-start gap-3 rounded-lg border border-border bg-surface p-5 shadow-xs sm:p-6">
      <Title className="flex items-center gap-3 text-headline font-semibold text-text">
        <TriangleAlert className="size-6 shrink-0 text-danger-text" aria-hidden="true" />
        {labels.title}
      </Title>
      <p className="text-body text-text-secondary">{labels.body}</p>
      <button type="button" className={buttonVariants({ variant: 'secondary' })} onClick={retry}>
        <RotateCw aria-hidden="true" />
        {labels.retry}
      </button>
    </section>
  );
  if (labels.page === undefined) return card;
  return (
    <div className="flex flex-col gap-stack">
      <h1 className="text-title-2 break-words lg:text-title-1">{labels.page}</h1>
      {card}
    </div>
  );
});
