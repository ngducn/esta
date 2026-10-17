import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

function Block({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('block animate-pulse rounded-sm bg-rule', className)} />;
}

/** One status region per loading area, so a screen reader hears "Đang tải" once rather than per block. */
function Loading({ children, className }: { children: ReactNode; className?: string }) {
  const t = useTranslations('components');
  return (
    <div role="status" data-slot="skeleton" className={className}>
      <span className="sr-only">{t('loading')}</span>
      {children}
    </div>
  );
}

export function SkeletonPage() {
  return (
    <Loading className="flex flex-col gap-6">
      <Block className="h-9 w-56 max-w-full" />
      <div className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
        <Block className="h-7 w-64 max-w-full" />
        <Block className="h-5 w-full max-w-prose" />
        <Block className="mt-2 h-touch w-44" />
      </div>
    </Loading>
  );
}

/** Photo-led cards in the grid the property list draws, so the list lands without a shift. */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <Loading className="flex flex-col gap-5">
      <Block className="h-9 w-40 max-w-full" />
      <Block className="h-touch w-full lg:max-w-sm" />
      <div className="grid gap-4 md:grid-cols-2 lg:gap-5 xl:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="flex flex-col overflow-hidden rounded-lg border border-rule bg-surface shadow-card">
            <Block className="aspect-[16/10] w-full rounded-none" />
            <div className="flex flex-col gap-2.5 p-4">
              <Block className="h-7 w-40" />
              <Block className="h-6 w-56 max-w-full" />
              <Block className="h-5 w-full" />
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
      <div className="overflow-hidden rounded-lg border border-rule bg-surface shadow-card md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
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
      <div className="flex items-center justify-between border-b border-rule py-3">
        <Block className="h-6 w-36" />
        <Block className="h-5 w-20" />
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-3 border-b border-rule py-3">
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
    <Loading className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
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
