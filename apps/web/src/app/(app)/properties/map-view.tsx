import type { PropertyListRow } from '@esta/core/properties';
import { getLocale, getMessages } from 'next-intl/server';
import { PropertiesMapLoader } from '@/components/map/properties-map-loader';
import type { LocateTarget, MapProperty } from '@/components/map/types';
import type { PropertyCardData } from '@/components/properties/property-card';
import { readBoundary } from '@/server/properties/boundary';
import { getThemePreference } from '@/server/theme';

/** The server half of the map view: the household's rows as map properties, the open panel's boundary, and the island's messages. */
export default async function MapView({ cards, rows, locate, query }: { cards: readonly PropertyCardData[]; rows: readonly PropertyListRow[]; locate: string | null; query: string }) {
  const located = rows.find((row) => row.id === locate);
  const [theme, locale, messages, boundary] = await Promise.all([
    getThemePreference(),
    getLocale(),
    getMessages(),
    located === undefined ? null : readBoundary(located.id),
  ]);
  const properties: MapProperty[] = cards.map((card, index) => ({
    id: card.id,
    nickname: card.nickname,
    kind: card.kind,
    address: card.address,
    photoUrl: card.photoUrl,
    location: rows[index]?.location ?? null,
  }));
  const target: LocateTarget | null = located === undefined ? null : { id: located.id, boundary };
  return (
    <PropertiesMapLoader
      locale={locale}
      messages={{ map: messages.map, components: { toast: messages.components.toast } }}
      properties={properties}
      theme={theme}
      locate={target}
      query={query}
    />
  );
}
