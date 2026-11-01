import { useTranslations } from 'next-intl';
import { propertyGrid } from './property-card';

function Block({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block rounded-md bg-skeleton ${className}`} />;
}

export function SkeletonProperties({ count = 3 }: { count?: number }) {
  const t = useTranslations('components');
  return (
    <div role="status" data-slot="skeleton" className="flex flex-col gap-stack">
      <span className="sr-only">{t('loading')}</span>
      <div className="flex flex-col gap-2">
        <Block className="h-8 w-40 max-w-full" />
        <Block className="h-5 w-32" />
      </div>
      <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
        <div className="flex flex-col gap-2 px-5 py-4">
          <Block className="h-5 w-24" />
          <Block className="h-8 w-40" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Block className="h-touch w-72 max-w-full" />
        <Block className="h-touch w-full max-w-sm" />
      </div>
      <div className={propertyGrid}>
        {Array.from({ length: count }, (_, index) => (
          <div key={index} aria-busy="true" className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
            <Block className="aspect-[16/10] w-full rounded-none" />
            <div className="flex flex-col gap-2 px-5 pt-4 pb-5">
              <Block className="h-6 w-28 rounded-full" />
              <Block className="h-6 w-3/4" />
              <Block className="h-5 w-11/12" />
              <Block className="h-9 w-44" />
              <Block className="mt-2 h-5 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
