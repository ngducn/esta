'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition, type MouseEvent, type ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';

type MonthLink = { readonly href: string; readonly label: string };

export type MonthSelectorProps = {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  previous: MonthLink;
  next: MonthLink;
  /** Shown beside the selector when the board is not on the Clock's month. */
  thisMonth: MonthLink | null;
};

/**
 * `?month=` picks the board. A month change keeps the old board on screen until the new one arrives, so the board dims
 * and reads busy meanwhile. The native select lists the months in the member's language whatever the browser's, which a
 * month input would not, and covers its pill so a tap anywhere opens the picker.
 */
export function MonthSelector({ label, value, options, previous, next, thisMonth, children }: MonthSelectorProps & { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = options.find((option) => option.value === value);
  const step = cn(buttonVariants({ variant: 'outline' }), 'px-3');
  const go = (href: string) => startTransition(() => router.push(href, { scroll: false }));
  const follow = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    go(href);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* On a phone the month sits on its own line, and the two steps wrap rather than overlap when long month names at 130% outgrow it (FND-8). */}
        <nav aria-label={label} className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <Link href={previous.href} onClick={(event) => follow(event, previous.href)} className={step} data-testid="month-previous">
            <ChevronLeft aria-hidden="true" />
            {previous.label}
          </Link>
          <label className="relative flex min-h-touch items-center gap-2 rounded-sm border border-rule-strong bg-surface pr-10 pl-4 text-body font-semibold text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent max-sm:order-first max-sm:basis-full">
            <span className="sr-only">{label}</span>
            <span aria-hidden="true" className="figures">
              {current?.label}
            </span>
            <select
              data-testid="month-select"
              value={value}
              onChange={(event) => go(`/collections?month=${event.target.value}`)}
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
          <Link href={next.href} onClick={(event) => follow(event, next.href)} className={cn(step, 'max-sm:ml-auto')} data-testid="month-next">
            {next.label}
            <ChevronRight aria-hidden="true" />
          </Link>
        </nav>
        {thisMonth === null ? null : (
          <Link href={thisMonth.href} onClick={(event) => follow(event, thisMonth.href)} data-testid="month-this" className={buttonVariants({ variant: 'quiet' })}>
            {thisMonth.label}
          </Link>
        )}
      </div>
      <div data-testid="month-board" aria-busy={pending} className={cn('transition-opacity duration-(--duration-base) ease-standard', pending && 'opacity-50')}>
        {children}
      </div>
    </>
  );
}
