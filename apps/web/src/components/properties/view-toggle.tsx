import { PROPERTY_VIEWS, propertyFiltersQuery, type PropertyFilters, type PropertyView } from '@esta/core/properties';
import { List, Map as MapIcon, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const viewIcons = { list: List, map: MapIcon } as const satisfies Record<PropertyView, LucideIcon>;

/** Links, not buttons, so the choice lives in the URL with the filters and works before any script runs. */
export function ViewToggle({ filters, label, optionLabel }: { filters: PropertyFilters; label: string; optionLabel: (view: PropertyView) => string }) {
  return (
    <nav aria-label={label} className="flex shrink-0 rounded-md border border-rule-strong bg-surface p-1">
      {PROPERTY_VIEWS.map((view) => {
        const Icon = viewIcons[view];
        const active = filters.view === view;
        return (
          <Link
            key={view}
            href={`/properties${propertyFiltersQuery({ ...filters, view })}`}
            aria-current={active ? 'page' : undefined}
            scroll={false}
            className={cn(
              'flex min-h-touch flex-1 items-center justify-center gap-2 rounded-sm px-4 text-body font-medium whitespace-nowrap transition-colors duration-(--duration-fast) ease-standard [&_svg]:size-5',
              active ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-surface-2',
            )}
          >
            <Icon aria-hidden="true" />
            {optionLabel(view)}
          </Link>
        );
      })}
    </nav>
  );
}
