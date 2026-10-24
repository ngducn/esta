'use client';

import type { GeoPoint } from '@esta/core/maps';
import dynamic from 'next/dynamic';
import { NextIntlClientProvider, useTranslations, type AbstractIntlMessages } from 'next-intl';
import { useOptimistic, useState } from 'react';
import { setPropertyBoundary, setPropertyLocation } from '@/app/(app)/properties/location-actions';
import { useUndoToast } from '@/components/undo-toast';
import { UndoToastProvider } from '@/components/undo-toast-provider';
import { useAction } from '@/components/use-action';
import type { Theme } from '@/design/tokens';
import type { Locale } from '@/i18n/locale';
import { MapCanvas } from './map-canvas';
import type { LinkPreview } from './paste-maps-link';
import { PinCard } from './pin-card';
import type { DrawMode, LocateTarget, MapProperty } from './types';
import { UnpinnedList } from './unpinned-list';

const LocationTools = dynamic(() => import('./location-tools').then((module) => module.LocationTools));

type Props = {
  properties: readonly MapProperty[];
  theme: Theme;
  canEdit: boolean;
  locate: LocateTarget | null;
  /** The list's filter query with `view=map`, so every link out of the map keeps search and filters. */
  query: string;
};

type Draft = { readonly preview: LinkPreview | null; readonly draw: DrawMode; readonly ring: GeoPoint[] | null; readonly failed: boolean };

const NO_DRAFT: Draft = { preview: null, draw: 'off', ring: null, failed: false };

/** The root layout has no intl provider, so the island brings its own with only the `map` and toast messages. */
export function PropertiesMap({ locale, messages, ...props }: Props & { locale: Locale; messages: AbstractIntlMessages }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Ho_Chi_Minh">
      <UndoToastProvider>
        <MapView {...props} />
      </UndoToastProvider>
    </NextIntlClientProvider>
  );
}

function MapView({ properties, theme, canEdit, locate, query }: Props) {
  const t = useTranslations('map');
  const showUndo = useUndoToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(NO_DRAFT);
  const [draftFor, setDraftFor] = useState(locate?.id ?? null);
  if ((locate?.id ?? null) !== draftFor) {
    setDraftFor(locate?.id ?? null);
    setDraft(NO_DRAFT);
  }
  const { pending: saving, run } = useAction();

  const target = locate === null ? null : (properties.find((property) => property.id === locate.id) ?? null);
  const [pin, setOptimisticPin] = useOptimistic<GeoPoint | null>(target?.location ?? null);
  const selected = target === null && selectedId !== null ? (properties.find((property) => property.id === selectedId) ?? null) : null;
  const pins = properties.flatMap(({ id, nickname, location }) => (location === null ? [] : [{ id, nickname, lat: location.lat, lng: location.lng }]));
  const locateHref = canEdit ? (id: string) => `/properties${query}&locate=${id}` : null;

  const savePin = (point: GeoPoint) => {
    if (target === null) return;
    run(
      () => {
        // The optimistic pin only shows when it is set inside the transition, before the save is awaited.
        setOptimisticPin(point);
        return setPropertyLocation(target.id, point);
      },
      (result) => {
        setDraft((current) => ({ ...current, preview: null, failed: !result.ok }));
        if (!result.ok) return;
        showUndo(t('pinSaved', { nickname: target.nickname }), () => run(() => setPropertyLocation(target.id, result.previous), () => undefined));
      },
    );
  };

  const saveBoundary = (ring: readonly GeoPoint[] | null) => {
    if (target === null) return;
    run(
      () => setPropertyBoundary(target.id, ring),
      (result) => {
        setDraft((current) => (result.ok ? { ...current, draw: 'off', ring: null, failed: false } : { ...current, failed: true }));
        if (!result.ok) return;
        showUndo(t(ring === null ? 'boundaryCleared' : 'boundarySaved', { nickname: target.nickname }), () =>
          run(() => setPropertyBoundary(target.id, result.previous), () => undefined),
        );
      },
    );
  };

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] lg:items-start lg:gap-5">
      <div
        className={`relative overflow-hidden rounded-lg border border-rule shadow-card lg:sticky lg:top-6 lg:h-[calc(100dvh-13rem)] lg:min-h-[30rem] ${target === null ? 'h-[60dvh] min-h-80' : 'h-[45dvh] min-h-72'}`}
      >
        <MapCanvas
          theme={theme}
          label={t('region')}
          pins={pins}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          edit={
            target === null || locate === null
              ? null
              : {
                  propertyId: target.id,
                  nickname: target.nickname,
                  pin,
                  preview: draft.preview?.point ?? null,
                  boundary: locate.boundary,
                  draw: draft.draw,
                  onPinMove: savePin,
                  onDraw: (ring) => setDraft((current) => ({ ...current, ring })),
                }
          }
        />
        {selected === null ? null : (
          <PinCard property={selected} editHref={locateHref?.(selected.id) ?? null} onClose={() => setSelectedId(null)} />
        )}
      </div>

      {target === null || locate === null ? (
        <UnpinnedList properties={properties.filter((property) => property.location === null)} locateHref={locateHref} />
      ) : (
        <LocationTools
          nickname={target.nickname}
          address={target.address}
          closeHref={`/properties${query}`}
          pin={pin}
          boundary={locate.boundary}
          preview={draft.preview}
          draw={draft.draw}
          ring={draft.ring}
          failed={draft.failed}
          saving={saving}
          onPreview={(preview) => setDraft((current) => ({ ...current, preview }))}
          onDraw={(draw) => setDraft((current) => ({ ...current, draw, ring: null }))}
          onSavePin={savePin}
          onSaveBoundary={saveBoundary}
        />
      )}
    </div>
  );
}
