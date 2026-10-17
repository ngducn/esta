import { vnd } from '@esta/core/money';
import { formatVnd } from '@esta/core/format';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { LocationCard } from '@/components/properties/location-card';
import { OverviewFacts, type OverviewFact } from '@/components/properties/overview-facts';
import { readBoundary } from '@/server/properties/boundary';
import { loadPropertyDetail } from '@/server/properties/detail';
import { getThemePreference } from '@/server/theme';

type DetailFormat = 'count' | 'meters' | 'text' | 'vnd';

/** The kind details the overview shows, in this order; a key missing here, or a value of the wrong shape, is left out. */
const KIND_DETAILS = [
  ['building_name', 'text'],
  ['block', 'text'],
  ['floor', 'count'],
  ['unit_no', 'text'],
  ['room_count', 'count'],
  ['frontage_m', 'meters'],
  ['road_width_m', 'meters'],
  ['management_fee_vnd', 'vnd'],
] as const satisfies readonly (readonly [string, DetailFormat])[];

const text = z.string().trim().min(1);
const number = z.number().nonnegative();
const integer = z.number().int().nonnegative();

export default async function PropertyOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await loadPropertyDetail(id);
  if (property === null) notFound();
  const [t, tp, theme, locale, messages, boundary] = await Promise.all([
    getTranslations('propertyDetail'),
    getTranslations('properties'),
    getThemePreference(),
    getLocale(),
    getMessages(),
    property.hasBoundary ? readBoundary(id) : null,
  ]);

  const format: Record<DetailFormat, (value: unknown) => string | null> = {
    text: (value) => text.safeParse(value).data ?? null,
    count: (value) => {
      const parsed = integer.safeParse(value);
      return parsed.success ? String(parsed.data) : null;
    },
    meters: (value) => {
      const parsed = number.safeParse(value);
      return parsed.success ? t('meters', { value: parsed.data }) : null;
    },
    vnd: (value) => {
      const parsed = integer.safeParse(value);
      return parsed.success ? formatVnd(vnd(parsed.data), locale) : null;
    },
  };
  const details: OverviewFact[] = KIND_DETAILS.flatMap(([key, kind]) => {
    const value = format[kind](property.kindDetails[key]);
    return value === null ? [] : [{ key, label: t('detail', { key }), value }];
  });

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <OverviewFacts
        facts={{
          title: t('factsTitle'),
          kind: property.kind,
          kindTerm: t('factKind'),
          kindLabel: tp('kind', { kind: property.kind }),
          details,
          useTerm: t('factUse'),
          useMode: property.useMode,
          useLabel: tp('use', { use: property.useMode }),
          legalTerm: t('factLegal'),
          legalStatus: property.legalStatus,
          legalLabel: tp('legal', { legal: property.legalStatus }),
        }}
      />
      <LocationCard
        locateHref={`/properties?view=map&locate=${property.id}`}
        labels={{ title: t('locationTitle'), edit: t('editLocation'), set: t('setLocation'), none: t('noLocation'), noneBody: t('noLocationBody') }}
        map={
          property.location === null
            ? null
            : {
                locale,
                messages: { map: messages.map },
                theme,
                label: t('mapLabel', { nickname: property.nickname }),
                pin: { id: property.id, nickname: property.nickname, ...property.location },
                boundary,
              }
        }
      />
    </div>
  );
}
