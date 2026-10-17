'use client';

import type { GeoPoint } from '@esta/core/maps';
import { MapPin } from 'lucide-react';
import { Marker, type Map as MapLibre } from 'maplibre-gl';
import { useEffect, useEffectEvent, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { MapEdit } from './map-surface';

export type MapPin = { readonly id: string; readonly nickname: string; readonly lat: number; readonly lng: number };

const pinButton =
  'group flex size-touch items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const pinHead =
  'flex size-9 items-center justify-center rounded-full border-2 border-surface shadow-sheet transition-transform duration-(--duration-fast) ease-standard [&_svg]:size-5';

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
  const editing = edit?.propertyId ?? null;
  const wanted = [
    ...pins.filter((pin) => pin.id !== editing).map((pin) => ({ key: pin.id, point: pin, draggable: false })),
    ...(edit?.pin == null ? [] : [{ key: 'edit', point: edit.pin, draggable: edit.draw === 'off' }]),
    ...(edit?.preview == null ? [] : [{ key: 'preview', point: edit.preview, draggable: false }]),
  ];
  const elements = useMarkers(map, wanted, (point) => edit?.onPinMove(point));
  const byId = new Map(pins.map((pin) => [pin.id, pin]));
  const editNickname = editing === null ? '' : (byId.get(editing)?.nickname ?? '');

  return [...elements].map(([key, element]) => {
    if (key === 'edit') {
      return createPortal(
        <span data-testid="edit-pin" aria-label={editNickname} role="img" className={cn(pinButton, 'cursor-grab active:cursor-grabbing')}>
          <span className={cn(pinHead, 'size-11 bg-accent text-on-accent')}>
            <MapPin aria-hidden="true" strokeWidth={2.25} />
          </span>
        </span>,
        element,
        key,
      );
    }
    if (key === 'preview') {
      return createPortal(
        <span data-testid="preview-pin" role="img" aria-label={editNickname} className={pinButton}>
          <span className={cn(pinHead, 'border-dashed border-accent bg-surface text-accent')}>
            <MapPin aria-hidden="true" strokeWidth={2.25} />
          </span>
        </span>,
        element,
        key,
      );
    }
    const pin = byId.get(key);
    if (pin === undefined) return null;
    const selected = pin.id === selectedId;
    const inert = editing !== null;
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
        className={cn(pinButton, inert && 'pointer-events-none opacity-60')}
      >
        <span className={cn(pinHead, selected ? 'scale-115 bg-ink text-surface' : 'bg-accent text-on-accent group-hover:scale-110')}>
          <MapPin aria-hidden="true" strokeWidth={2.25} />
        </span>
      </button>,
      element,
      key,
    );
  });
}
