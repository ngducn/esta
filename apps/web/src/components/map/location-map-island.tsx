'use client';

import type { GeoPoint } from '@esta/core/maps';
import { NextIntlClientProvider } from 'next-intl';
import { MapCanvas } from './map-canvas';
import type { LocationMapProps } from './location-map';
import type { MapPin } from './property-pins';

const ignoreSelect = () => undefined;

export type MapIslandProps = Omit<LocationMapProps, 'pin' | 'boundary'> & {
  readonly pins: readonly MapPin[];
  readonly boundary?: readonly GeoPoint[] | null;
  readonly onSelect?: (id: string | null) => void;
};

/** The root layout has no intl provider, so the island brings its own with only the `map` messages. */
export function MapIsland({ locale, messages, theme, label, pins, boundary = null, onSelect = ignoreSelect }: MapIslandProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Ho_Chi_Minh">
      <MapCanvas theme={theme} label={label} pins={pins} selectedId={null} onSelect={onSelect} edit={null} boundary={boundary} />
    </NextIntlClientProvider>
  );
}
