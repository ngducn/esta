import { PROPERTY_FILTER_KEYS, propertyFiltersQuery, type FilterTally, type PropertyFilterKey, type PropertyFilters } from '@esta/core/properties';
import { SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type FilterChip = { value: string | null; label: string; count: number };
export type FilterGroup = { key: PropertyFilterKey; label: string; chips: readonly FilterChip[] };

export function filterChips(
  key: PropertyFilterKey,
  tally: FilterTally,
  selected: string | null,
  label: (value: string) => string,
  allLabel: string,
  compare: (a: FilterChip, b: FilterChip) => number = (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'),
): FilterChip[] {
  const values = [...tally.values].map(([value, count]) => ({ value, label: label(value), count }));
  if (selected !== null && !tally.values.has(selected)) values.push({ value: selected, label: label(selected), count: 0 });
  values.sort(compare);
  return [{ value: null, label: allLabel, count: tally.all }, ...values];
}

/** A group with one value offers no choice, so it shows only while a value of it is picked. */
export function hasChoice(group: FilterGroup, selected: string | null): boolean {
  return selected !== null || group.chips.length > 2;
}

const SHEET_ID = 'property-filters';

const chip =
  'inline-flex min-h-touch items-center gap-2 rounded-full border px-4 text-small font-semibold transition-colors duration-(--duration-fast) ease-standard';

export function FilterChips({
  groups,
  filters,
  labels,
}: {
  groups: readonly FilterGroup[];
  filters: PropertyFilters;
  labels: { open: string; title: string; done: string };
}) {
  const active = PROPERTY_FILTER_KEYS.filter((key) => filters[key] !== null).length;
  return (
    <>
      <button type="button" popoverTarget={SHEET_ID} className={buttonVariants({ variant: 'outline', className: 'lg:hidden' })}>
        <SlidersHorizontal aria-hidden="true" />
        {labels.open}
        {active > 0 ? <span className="rounded-full bg-ink px-2 text-small text-surface">{active}</span> : null}
      </button>
      <div
        id={SHEET_ID}
        popover="auto"
        aria-label={labels.title}
        className={cn(
          'fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-lg border-t border-rule bg-surface p-5 pb-[max(--spacing(5),env(safe-area-inset-bottom))] text-ink shadow-sheet backdrop:bg-ground/85',
          'lg:static lg:order-last lg:block lg:basis-full lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none',
        )}
      >
        <h2 className="mb-4 text-lead font-bold lg:sr-only">{labels.title}</h2>
        <div className="flex flex-col gap-4 lg:gap-3">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label} className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
              <h3 className="text-small font-semibold text-ink-muted lg:w-28 lg:shrink-0">{group.label}</h3>
              <ul className="flex flex-wrap gap-2">
                {group.chips.map((option) => {
                  const current = filters[group.key] === option.value;
                  return (
                    <li key={option.value ?? ''}>
                      <Link
                        href={`/properties${propertyFiltersQuery({ ...filters, [group.key]: option.value })}`}
                        replace
                        scroll={false}
                        aria-current={current ? 'true' : undefined}
                        data-filter={group.key}
                        className={cn(chip, current ? 'border-ink bg-ink text-surface' : 'border-rule-strong bg-surface text-ink hover:border-field')}
                      >
                        {option.label}
                        <span className={cn('font-medium tabular-nums', !current && 'text-ink-muted')}>{option.count}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        <button
          type="button"
          popoverTarget={SHEET_ID}
          popoverTargetAction="hide"
          className={buttonVariants({ variant: 'primary', className: 'sticky bottom-0 mt-6 w-full shadow-sheet lg:hidden' })}
        >
          {labels.done}
        </button>
      </div>
    </>
  );
}
