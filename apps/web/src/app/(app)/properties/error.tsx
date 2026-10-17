'use client';

import { RotateCw, TriangleAlert } from 'lucide-react';
import { useErrorLabels } from '@/components/properties/error-labels';
import { buttonVariants } from '@/components/ui/button-variants';

export default function PropertiesError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const labels = useErrorLabels();
  return (
    <section role="alert" className="flex max-w-3xl flex-col items-start gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <h1 className="flex items-center gap-3 text-lead font-bold text-ink">
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
}
