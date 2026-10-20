'use client';

import { Map as MapIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import type { MapIslandProps } from '@/components/map/location-map-island';
import { IntentLink } from '@/components/shell/intent-link';
import { buttonVariants } from '@/components/ui/button-variants';

/** SPEC §7.2: a phone never fetches the island, MapLibre or a tile; a desktop loads them after Home has drawn. */
const MapIsland = dynamic(() => import('@/components/map/location-map-island').then((module) => module.MapIsland), { ssr: false });

/** The `lg` breakpoint the strip shows from. Media queries read rem at the browser's 16 px, whatever the text scale. */
const WIDE = '(min-width: 64rem)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const useWide = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );

export type HomeMapStripProps = { readonly title: string; readonly openLabel: string; readonly map: Omit<MapIslandProps, 'onSelect'> };

/** Home's map of the pinned properties, from 1024 px only; a pin opens its property. */
export function HomeMapStrip({ title, openLabel, map }: HomeMapStripProps) {
  const wide = useWide();
  const router = useRouter();
  return (
    <section aria-labelledby="home-map-title" data-testid="home-map-strip" className="hidden flex-col gap-4 rounded-lg border border-rule bg-surface p-6 shadow-card lg:flex">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="home-map-title" className="text-h3 text-ink">
          {title}
        </h2>
        <IntentLink href="/properties?view=map" className={buttonVariants({ variant: 'outline' })}>
          <MapIcon aria-hidden="true" />
          {openLabel}
        </IntentLink>
      </div>
      <div data-testid="home-map" className="relative h-72 overflow-hidden rounded-md border border-rule bg-surface-2">
        {wide ? <MapIsland {...map} onSelect={(id) => (id === null ? undefined : router.push(`/properties/${id}`))} /> : null}
      </div>
    </section>
  );
}
