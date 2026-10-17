'use client';

import { useSelectedLayoutSegment } from 'next/navigation';
import { IntentLink } from '@/components/shell/intent-link';
import { PROPERTY_TABS, propertyTabHref, type PropertyTabId } from './property-tabs';

/** The active tab reads by shape and weight as well as color: a bold label over a solid bar. */
export function PropertyTabBar({ propertyId, label, labels }: { propertyId: string; label: string; labels: Record<PropertyTabId, string> }) {
  const segment = useSelectedLayoutSegment();
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto border-b border-rule px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-2">
        {PROPERTY_TABS.map((tab) => (
          <li key={tab.id}>
            <IntentLink
              href={propertyTabHref(propertyId, tab)}
              aria-current={segment === tab.segment ? 'page' : undefined}
              className="-mb-px flex min-h-touch items-center border-b-3 border-transparent px-3 text-body font-medium whitespace-nowrap text-ink-muted transition-colors duration-(--duration-fast) ease-standard outline-none hover:text-ink focus-visible:rounded-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-[current=page]:border-accent aria-[current=page]:font-bold aria-[current=page]:text-ink"
            >
              {labels[tab.id]}
            </IntentLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
