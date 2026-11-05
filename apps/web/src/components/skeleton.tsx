import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

function Block({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('block rounded-md bg-skeleton', className)} />;
}

/** One status region per loading area, so a screen reader hears "Đang tải" once rather than per block. */
function Loading({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  const t = useTranslations('components');
  return (
    <div role="status" data-slot="skeleton" data-testid={testId} className={className}>
      <span className="sr-only">{t('loading')}</span>
      {children}
    </div>
  );
}

export function SkeletonPage() {
  return (
    <Loading className="flex flex-col gap-6">
      <Block className="h-9 w-56 max-w-full" />
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-card-pad shadow-xs">
        <Block className="h-7 w-64 max-w-full" />
        <Block className="h-5 w-full max-w-prose" />
        <Block className="mt-2 h-touch w-44" />
      </div>
    </Loading>
  );
}

/** The vault as it lands: the title, the search bar, the expiring card and a row of 4:3 document tiles. */
export function SkeletonVault() {
  return (
    <Loading testId="skeleton-vault" className="flex flex-col gap-stack">
      <Block className="h-9 w-40 max-w-full" />
      <Block className="h-24 w-full" />
      <div className="flex flex-wrap items-center gap-2">
        <Block className="h-touch min-w-64 flex-1" />
        <Block className="h-9 w-48" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
            <Block className="aspect-[4/3] w-full rounded-none" />
            <div className="flex flex-col gap-2.5 p-4">
              <Block className="h-5 w-28" />
              <Block className="h-6 w-48 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** The detail header in the grid it draws, then the tab row, so the page lands without a shift. */
export function SkeletonPropertyHeader() {
  return (
    <Loading className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Block className="aspect-[16/10] w-full rounded-none md:aspect-auto md:min-h-60" />
        <div className="flex flex-col gap-4 p-5 lg:p-6">
          <Block className="h-9 w-64 max-w-full" />
          <Block className="h-7 w-48" />
          <Block className="h-5 w-full max-w-md" />
          <Block className="h-5 w-4/5 max-w-sm" />
        </div>
      </div>
      <Block className="h-touch w-56" />
    </Loading>
  );
}

export function SkeletonMoney({ large = false }: { large?: boolean }) {
  return (
    <Loading>
      <Block className={large ? 'h-12 w-72 max-w-full' : 'h-6 w-32'} />
    </Loading>
  );
}

export function SkeletonField() {
  return (
    <Loading className="flex flex-col gap-2">
      <Block className="h-5 w-28" />
      <Block className="h-4 w-48" />
      <Block className="h-touch w-full" />
      <Block className="h-5 w-32" />
    </Loading>
  );
}

export function SkeletonStatus() {
  return (
    <Loading className="flex items-center gap-2">
      <Block className="size-5 rounded-full" />
      <Block className="h-5 w-20" />
    </Loading>
  );
}

export function SkeletonRing() {
  return (
    <Loading className="flex items-center gap-2">
      <Block className="size-6 rounded-full" />
      <Block className="h-5 w-24" />
    </Loading>
  );
}

export function SkeletonAddress() {
  return (
    <Loading className="flex flex-col gap-2">
      <Block className="h-4 w-20" />
      <Block className="h-5 w-full max-w-md" />
      <Block className="h-4 w-16" />
      <Block className="h-5 w-4/5 max-w-sm" />
    </Loading>
  );
}

export function SkeletonTable({ rows = 4 }: { rows?: number }) {
  return (
    <Loading className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border py-3">
        <Block className="h-6 w-36" />
        <Block className="h-5 w-20" />
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-3 border-b border-border py-3">
          <Block className="size-6" />
          <div className="flex flex-1 flex-col gap-2">
            <Block className="h-5 w-32" />
            <Block className="h-4 w-48 max-w-full" />
          </div>
          <Block className="h-5 w-24" />
        </div>
      ))}
    </Loading>
  );
}

export function SkeletonEmptyState() {
  return (
    <Loading className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-card-pad shadow-xs">
      <Block className="h-7 w-64 max-w-full" />
      <Block className="h-5 w-full max-w-prose" />
      <Block className="mt-2 h-touch w-44" />
    </Loading>
  );
}

export function SkeletonButton() {
  return (
    <Loading>
      <Block className="h-touch w-32" />
    </Loading>
  );
}

export function SkeletonCollections() {
  const money = 'h-5 w-[12ch] @max-[56rem]:h-4';
  return (
    <Loading className="flex flex-col gap-stack">
      <div className="flex flex-col gap-2">
        <Block className="h-8 w-40 max-w-full" />
        <Block className="h-5 w-48" />
      </div>
      <Block className="h-touch w-80 max-w-full" />
      <div className="@container overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
        <div className="grid grid-cols-1 @min-[30rem]:grid-cols-2 @min-[40rem]:grid-cols-3">
          {[0, 1, 2].map((figure) => (
            <div key={figure} className="flex flex-col gap-2 px-5 py-4">
              <Block className="h-5 w-24" />
              <Block className="h-8 w-[12ch]" />
              <Block className="h-4 w-36" />
            </div>
          ))}
        </div>
      </div>
      <Block className="h-touch w-full max-w-lg" />
      <div className="@container overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
        <div className="h-11 border-b border-border bg-bg-subtle @max-[56rem]:hidden" />
        {Array.from({ length: 6 }, (_, row) => (
          <div
            key={row}
            className="flex min-h-row-h items-center gap-6 border-b border-border px-cell-x @max-[56rem]:grid @max-[56rem]:grid-cols-[minmax(0,1fr)_auto] @max-[56rem]:gap-x-3 @max-[56rem]:gap-y-2 @max-[56rem]:px-4 @max-[56rem]:py-3.5"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Block className="h-5 w-48 max-w-full" />
              <Block className="h-4 w-32" />
            </div>
            <Block className="h-5 w-24 @max-[56rem]:h-4" />
            <Block className={money} />
            <Block className={money} />
            <Block className="h-6 w-28 rounded-full @max-[56rem]:col-span-2" />
            <Block className="h-control-sm w-28 @max-[56rem]:col-span-2" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** Home as it lands: the title, today's list beside the month's figure on a desktop, the list first on a phone. */
export function SkeletonHome() {
  return (
    <Loading testId="skeleton-home" className="flex flex-col gap-6">
      <Block className="h-9 w-56 max-w-full" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-card-pad shadow-xs">
          <Block className="h-7 w-48" />
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Block className="h-6 w-56 max-w-full" />
                <Block className="h-5 w-40" />
              </div>
              <Block className="h-touch w-28" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-card-pad shadow-xs">
          <Block className="h-7 w-36" />
          <Block className="h-12 w-64 max-w-full" />
          <Block className="h-2 w-full" />
          <Block className="h-6 w-44" />
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Block key={index} className="h-6 w-24" />
            ))}
          </div>
        </div>
      </div>
    </Loading>
  );
}

/** Lease detail as it lands: the title and its actions, then the period rows first on a phone and beside the terms on a desktop. */
export function SkeletonLease() {
  return (
    <Loading testId="skeleton-lease" className="flex flex-col gap-5">
      <Block className="h-6 w-32" />
      <Block className="h-9 w-64 max-w-full" />
      <div className="flex flex-wrap gap-3">
        <Block className="h-touch w-28" />
        <Block className="h-touch w-36" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-card-pad shadow-xs">
          <Block className="h-7 w-40" />
          {Array.from({ length: 5 }, (_, index) => (
            <Block key={index} className="h-6 w-full max-w-sm" />
          ))}
        </div>
        <div className="order-first flex flex-col rounded-lg border border-border bg-surface shadow-xs lg:order-none">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex items-center justify-between gap-3 border-b border-border p-4 last:border-b-0 sm:px-5">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Block className="h-6 w-52 max-w-full" />
                <Block className="h-5 w-36" />
              </div>
              <Block className="h-7 w-28" />
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}
