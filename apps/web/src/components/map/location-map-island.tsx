'use client';

import { NextIntlClientProvider } from 'next-intl';
import { MapCanvas } from './map-canvas';
import type { LocationMapProps } from './location-map';

const ignoreSelect = () => undefined;

/** The root layout has no intl provider, so the island brings its own with only the `map` messages. */
export function LocationMapIsland({ locale, messages, theme, label, pin, boundary }: LocationMapProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Ho_Chi_Minh">
      <MapCanvas theme={theme} label={label} pins={[pin]} selectedId={null} onSelect={ignoreSelect} edit={null} boundary={boundary} />
    </NextIntlClientProvider>
  );
}
