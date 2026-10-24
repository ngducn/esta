'use client';

import type { GeoPoint } from '@esta/core/maps';
import { MapPin } from 'lucide-react';
import { LngLatBounds, Marker, type Map as MapLibre } from 'maplibre-gl';
import { useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MapEdit } from './map-surface';
import { groupPins, worldPixels } from './pin-groups';

export type MapPin = { readonly id: string; readonly nickname: string; readonly lat: number; readonly lng: number };

const pinButton =
  'group flex size-touch items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
/** The pin's touch target; two pins closer than this on screen become one group a tap zooms into. */
const TOUCH_PX = 44;
const GROUP_MAX_ZOOM = 17;

const pinHead =
  'flex items-center justify-center rounded-full border-2 border-surface shadow-sheet transition-transform duration-(--duration-fast) ease-standard [&_svg]:size-5';

/** One marker per key on a node React portals the pin into; positions and dragging follow the props without a remount. */
function useMarkers(map: MapLibre, wanted: readonly { key: string; point: GeoPoint; draggable: boolean }[], onDragEnd: (point: GeoPoint) => void) {
  const keys = wanted.map(({ key }) => key).join('|');
  const elements = useMemo(() => new Map(keys.split('|').filter(Boolean).map((key) => [key, document.createElement('div')])), [keys]);
  const markers = useRef(new Map<string, Marker>());
  const dragEnd = useEffectEvent(onDragEnd);
  const current = useEffectEvent((key: string) => wanted.find((entry) => entry.key === key));

  useEffect(() => {
    const created = new Map(
      [...elements].map(([key, element]) => {
        const entry = current(key);
        const marker = new Marker({ element, anchor: 'center', draggable: entry?.draggable ?? false })
          .setLngLat(entry === undefined ? [0, 0] : [entry.point.lng, entry.point.lat])
          .addTo(map);
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLngLat();
          dragEnd({ lat, lng });
        });
        return [key, marker] as const;
      }),
    );
    markers.current = created;
    return () => {
      for (const marker of created.values()) marker.remove();
    };
  }, [map, elements]);

  const signature = wanted.map(({ key, point, draggable }) => `${key}:${point.lat}:${point.lng}:${draggable}`).join('|');
  useEffect(() => {
    for (const { key, point, draggable } of wanted) {
      const marker = markers.current.get(key);
      if (marker === undefined) continue;
      marker.setLngLat([point.lng, point.lat]).setDraggable(draggable);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature stands for wanted
  }, [map, elements, signature]);

  return elements;
}

function useZoom(map: MapLibre): number {
  const [zoom, setZoom] = useState(() => map.getZoom());
  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    map.on('zoomend', update);
    update();
    return () => {
      map.off('zoomend', update);
    };
  }, [map]);
  return zoom;
}

export function PropertyPins({
  map,
  pins,
  selectedId,
  edit,
  onSelect,
}: {
  map: MapLibre;
  pins: readonly MapPin[];
  selectedId: string | null;
  edit: MapEdit | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('map');
  const zoom = useZoom(map);
  const editing = edit?.propertyId ?? null;
  const groups = groupPins(
    pins.filter((pin) => pin.id !== editing),
    (pin) => worldPixels(pin, zoom),
    TOUCH_PX,
  );
  const groupByKey = new Map(groups.map((group) => [group.key, group]));
  const wanted = [
    ...groups.map((group) => ({ key: group.key, point: group, draggable: false })),
    ...(edit?.pin == null ? [] : [{ key: 'edit', point: edit.pin, draggable: edit.draw === 'off' }]),
    ...(edit?.preview == null ? [] : [{ key: 'preview', point: edit.preview, draggable: false }]),
  ];
  const elements = useMarkers(map, wanted, (point) => edit?.onPinMove(point));

  return [...elements].map(([key, element]) => {
    if (key === 'edit') {
      return createPortal(
        <span data-testid="edit-pin" aria-label={edit?.nickname} role="img" className={`${pinButton} cursor-grab active:cursor-grabbing`}>
          <span className={`${pinHead} size-11 bg-accent text-on-accent`}>
            <MapPin aria-hidden="true" strokeWidth={2.25} />
          </span>
        </span>,
        element,
        key,
      );
    }
    if (key === 'preview') {
      return createPortal(
        <span data-testid="preview-pin" role="img" aria-label={t('previewPin', { nickname: edit?.nickname ?? '' })} className={pinButton}>
          <span className={`${pinHead} size-9 border-dashed border-accent bg-surface text-accent`}>
            <MapPin aria-hidden="true" strokeWidth={2.25} />
          </span>
        </span>,
        element,
        key,
      );
    }
    const group = groupByKey.get(key);
    const [pin] = group?.pins ?? [];
    if (group === undefined || pin === undefined) return null;
    const inert = editing !== null;
    if (group.pins.length > 1) {
      return createPortal(
        <button
          type="button"
          data-testid="pin-group"
          aria-label={t('pinGroup', { count: group.pins.length, names: group.pins.map(({ nickname }) => nickname).join(', ') })}
          tabIndex={inert ? -1 : 0}
          aria-hidden={inert}
          disabled={inert}
          onClick={(event) => {
            event.stopPropagation();
            const bounds = new LngLatBounds();
            for (const member of group.pins) bounds.extend([member.lng, member.lat]);
            map.fitBounds(bounds, { padding: 96, maxZoom: Math.max(GROUP_MAX_ZOOM, map.getZoom() + 2), duration: 0 });
          }}
          className={inert ? `${pinButton} pointer-events-none opacity-60` : pinButton}
        >
          <span className={`${pinHead} figures size-9 bg-accent text-body font-medium text-on-accent group-hover:scale-110`}>{group.pins.length}</span>
        </button>,
        element,
        key,
      );
    }
    const selected = pin.id === selectedId;
    return createPortal(
      <button
        type="button"
        data-testid="property-pin"
        aria-label={pin.nickname}
        aria-pressed={selected}
        tabIndex={inert ? -1 : 0}
        aria-hidden={inert}
        disabled={inert}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(pin.id);
        }}
        className={inert ? `${pinButton} pointer-events-none opacity-60` : pinButton}
      >
        <span className={selected ? `${pinHead} size-9 scale-115 bg-ink text-surface` : `${pinHead} size-9 bg-accent text-on-accent group-hover:scale-110`}>
          <MapPin aria-hidden="true" strokeWidth={2.25} />
        </span>
      </button>,
      element,
      key,
    );
  });
}
