'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';

type MonthLink = { readonly href: string; readonly label: string };

/**
 * `?month=` picks the board. The native select lists the months by their Vietnamese names whatever the browser's
 * own locale, which a month input would not, and covers its pill so a tap anywhere opens the picker.
 */
export function MonthSelector({
  label,
  value,
  options,
  previous,
  next,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  previous: MonthLink;
  next: MonthLink;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = options.find((option) => option.value === value);
  const step = cn(buttonVariants({ variant: 'outline' }), 'px-3');

  return (
    <nav aria-label={label} data-pending={pending || undefined} className="flex flex-wrap items-center gap-2">
      <Link href={previous.href} className={step} data-testid="month-previous">
        <ChevronLeft aria-hidden="true" />
        {previous.label}
      </Link>
      <label className="relative flex min-h-touch items-center gap-2 rounded-sm border border-rule-strong bg-surface pr-10 pl-4 text-body font-semibold text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
        <span className="sr-only">{label}</span>
        <span aria-hidden="true" className="figures">
          {current?.label}
        </span>
        <select
          data-testid="month-select"
          value={value}
          onChange={(event) => {
            const month = event.target.value;
            startTransition(() => router.push(`?month=${month}`, { scroll: false }));
          }}
          className="absolute -inset-px cursor-pointer appearance-none rounded-sm opacity-0"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 size-5 text-ink-muted" aria-hidden="true" />
      </label>
      <Link href={next.href} className={step} data-testid="month-next">
        {next.label}
        <ChevronRight aria-hidden="true" />
      </Link>
    </nav>
  );
}
