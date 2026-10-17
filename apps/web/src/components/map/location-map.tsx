'use client';

import type { GeoPoint } from '@esta/core/maps';
import dynamic from 'next/dynamic';
import type { AbstractIntlMessages } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { Theme } from '@/design/tokens';
import type { Locale } from '@/i18n/locale';

export type LocationMapProps = {
  readonly locale: Locale;
  readonly messages: AbstractIntlMessages;
  readonly theme: Theme;
  readonly label: string;
  readonly pin: { readonly id: string; readonly nickname: string } & GeoPoint;
  readonly boundary: readonly GeoPoint[] | null;
};

/** SPEC §7.2: the detail page ships none of the map; its island and MapLibre load once the card nears the viewport. */
const LocationMapIsland = dynamic(() => import('./location-map-island').then((module) => module.LocationMapIsland), { ssr: false });

export function LocationMap(props: LocationMapProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = frame.current;
    if (element === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frame} data-testid="location-map" className="relative h-64 overflow-hidden rounded-md border border-rule bg-surface-2 lg:h-80">
      {near ? <LocationMapIsland {...props} /> : null}
    </div>
  );
}
