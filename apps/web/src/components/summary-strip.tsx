import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Figure = {
  label: string;
  value: ReactNode | null;
  sub?: string;
};

const columns = { 2: '@min-[52rem]:grid-cols-2', 3: '@min-[52rem]:grid-cols-3', 4: '@min-[52rem]:grid-cols-4' } as const;

/**
 * The two to four figures a working screen is about, in one hairline surface. The strip is a container: it folds from
 * its own width, so the same markup fits a narrow column and a wide one. Each cell draws its top and left hairline and
 * the surface clips the outer ones, so any count of cells folds cleanly.
 */
export function SummaryStrip({ label, figures, unknownLabel }: { label: string; figures: readonly Figure[]; unknownLabel: string }) {
  const count = Math.min(4, Math.max(2, figures.length)) as keyof typeof columns;
  return (
    <section aria-label={label} className="@container overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
      <dl className={cn('-mt-px -ms-px grid grid-cols-1 @min-[30rem]:grid-cols-2', columns[count])}>
        {figures.map((figure) => (
          <div key={figure.label} className="flex min-w-0 flex-col gap-1 border-t border-s border-border px-5 py-4">
            <dt className="text-label font-medium text-text-secondary">{figure.label}</dt>
            <dd className="m-0 flex flex-col gap-1">
              {figure.value === null ? (
                <span role="img" aria-label={unknownLabel} className="text-figure-md text-text-muted">
                  —
                </span>
              ) : (
                <span className="num text-figure-md text-text">
                  {figure.value}
                </span>
              )}
              {figure.sub === undefined ? null : <span className="text-caption text-text-muted">{figure.sub}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
