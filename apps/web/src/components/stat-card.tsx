import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Meter = { readonly label: string; readonly percent: number };

const card = 'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-card-pad text-text shadow-xs';
const linked =
  'transition-[box-shadow,border-color] hover:border-border-strong hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring';

function MeterBar({ label, percent }: Meter) {
  const done = percent >= 100;
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent)} className="relative h-2 overflow-hidden rounded-full bg-border">
      <span className={cn('block h-full rounded-full', done ? 'bg-success-solid' : 'bg-accent')} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

/** One summary figure: label, the figure (null when unknown, drawn as a dash that is never a zero), an optional target and meter, one line of context. */
export function StatCard({
  label,
  badge,
  value,
  meter,
  sub,
  href,
  unknownLabel,
  hero = false,
  testId,
  children,
  labelId,
}: {
  label: string;
  badge?: ReactNode;
  value: ReactNode | null;
  meter?: Meter | null;
  sub?: ReactNode;
  href?: string;
  unknownLabel: string;
  hero?: boolean;
  testId?: string;
  children?: ReactNode;
  labelId?: string;
}) {
  const body = (
    <>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h2 id={labelId} className="text-label font-medium text-text-secondary">
          {label}
        </h2>
        {badge}
      </div>
      <p className={cn('flex flex-wrap items-baseline gap-x-2 font-semibold', hero ? 'text-figure-xl' : 'text-figure-lg')}>
        {value === null ? (
          <span role="img" aria-label={unknownLabel} className="text-text-muted">
            —
          </span>
        ) : (
          <span className="num whitespace-nowrap">{value}</span>
        )}
      </p>
      {meter ? <MeterBar {...meter} /> : null}
      {sub === undefined ? null : <p className="text-label font-normal text-text-secondary">{sub}</p>}
      {children}
    </>
  );
  if (href === undefined) {
    return (
      <section aria-labelledby={labelId} data-testid={testId} className={card}>
        {body}
      </section>
    );
  }
  return (
    <Link href={href} data-testid={testId} className={cn(card, 'no-underline', linked)}>
      {body}
    </Link>
  );
}
