'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { GeoPoint } from '@esta/core/maps';
import { getVersion, LngLatBounds, Map as MapLibre, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Theme } from '@/design/tokens';
import { BoundaryDrawing } from './polygon-draw';
import { DEFAULT_VIEW, FALLBACK_STYLE, LOCATE_ZOOM, MAP_STYLES, mapStyleUrl, tokenHex } from './map-style';
import { PropertyPins, type MapPin } from './property-pins';
import type { DrawMode } from './types';

setWorkerUrl(`/map-worker?v=${getVersion()}`);

/** What the location panel is editing; the map only reports moves and drawings back, the panel decides what to save. */
export type MapEdit = {
  readonly propertyId: string;
  readonly pin: GeoPoint | null;
  readonly preview: GeoPoint | null;
  readonly boundary: readonly GeoPoint[] | null;
  readonly draw: DrawMode;
  readonly onPinMove: (point: GeoPoint) => void;
  readonly onDraw: (ring: GeoPoint[] | null) => void;
};

export type MapStatus = 'loading' | 'ready' | 'tiles_failed';

export type MapSurfaceProps = {
  readonly theme: Theme;
  readonly label: string;
  readonly pins: readonly MapPin[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly edit: MapEdit | null;
  readonly onStatus: (status: MapStatus) => void;
};

const BOUNDARY_SOURCE = 'esta-boundary';
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function boundaryData(ring: readonly GeoPoint[] | null): GeoJSON.FeatureCollection {
  const [first] = ring ?? [];
  if (ring === null || first === undefined || ring.length < 3) return EMPTY;
  const coordinates = [[...ring, first].map(({ lat, lng }) => [lng, lat])];
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } }] };
}

function addBoundaryLayers(map: MapLibre, theme: Theme) {
  if (map.getSource(BOUNDARY_SOURCE) !== undefined) return;
  map.addSource(BOUNDARY_SOURCE, { type: 'geojson', data: EMPTY });
  map.addLayer({ id: `${BOUNDARY_SOURCE}-fill`, type: 'fill', source: BOUNDARY_SOURCE, paint: { 'fill-color': tokenHex('accent', theme), 'fill-opacity': 0.14 } });
  map.addLayer({ id: `${BOUNDARY_SOURCE}-line`, type: 'line', source: BOUNDARY_SOURCE, paint: { 'line-color': tokenHex('accent', theme), 'line-width': 2.5 } });
}

export default function MapSurface({ theme, label, pins, selectedId, onSelect, edit, onStatus }: MapSurfaceProps) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibre | null>(null);
  const [styled, setStyled] = useState(false);
  const [styleName, setStyleName] = useState<string>(MAP_STYLES[theme]);
  const reportStatus = useEffectEvent(onStatus);
  const handleClick = useEffectEvent((point: GeoPoint) => {
    if (edit === null) onSelect(null);
    else if (edit.pin === null && edit.draw === 'off') edit.onPinMove(point);
  });

  useEffect(() => {
    const element = container.current;
    if (element === null) return;
    let fellBack = false;
    const instance = new MapLibre({
      container: element,
      style: mapStyleUrl(MAP_STYLES[theme]),
      center: DEFAULT_VIEW.center,
      zoom: DEFAULT_VIEW.zoom,
      attributionControl: { compact: false },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    instance.touchZoomRotate.disableRotation();
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    instance.on('style.load', () => {
      addBoundaryLayers(instance, theme);
      setStyled(true);
      reportStatus('ready');
    });
    instance.on('error', () => {
      if (!instance.isStyleLoaded() && !fellBack && MAP_STYLES[theme] !== FALLBACK_STYLE) {
        fellBack = true;
        setStyleName(FALLBACK_STYLE);
        instance.setStyle(mapStyleUrl(FALLBACK_STYLE));
        return;
      }
      reportStatus('tiles_failed');
    });
    instance.on('click', (event) => handleClick({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
    setMap(instance);
    return () => {
      setMap(null);
      setStyled(false);
      instance.remove();
    };
  }, [theme]);

  const pinKey = pins.map((pin) => pin.id).join();
  const editId = edit?.propertyId ?? null;
  useEffect(() => {
    const [only] = pins;
    if (map === null || editId !== null || only === undefined) return;
    if (pins.length === 1) {
      map.jumpTo({ center: [only.lng, only.lat], zoom: 13 });
      return;
    }
    const bounds = new LngLatBounds();
    for (const pin of pins) bounds.extend([pin.lng, pin.lat]);
    map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 });
    // Fit only when the set of pins or the mode changes, never when a pin card opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinKey stands for pins
  }, [map, pinKey, editId]);

  const focus = edit === null ? null : (edit.preview ?? edit.pin);
  const focusKey = focus === null ? null : `${focus.lat},${focus.lng}`;
  useEffect(() => {
    if (map === null || focus === null) return;
    map.easeTo({ center: [focus.lng, focus.lat], zoom: Math.max(map.getZoom(), LOCATE_ZOOM), duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focusKey stands for focus
  }, [map, editId, focusKey]);

  const shownBoundary = edit !== null && edit.draw === 'off' ? edit.boundary : null;
  useEffect(() => {
    if (map === null || !styled) return;
    (map.getSource(BOUNDARY_SOURCE) as GeoJSONSource | undefined)?.setData(boundaryData(shownBoundary));
  }, [map, styled, shownBoundary]);

  return (
    <>
      <div ref={container} role="region" aria-label={label} data-testid="map-canvas" data-style={styleName} data-ready={styled} className="size-full" />
      {map === null ? null : (
        <>
          <PropertyPins map={map} pins={pins} selectedId={selectedId} edit={edit} onSelect={onSelect} />
          {styled && edit !== null && edit.draw !== 'off' ? (
            <BoundaryDrawing map={map} theme={theme} mode={edit.draw} boundary={edit.boundary} onDraw={edit.onDraw} />
          ) : null}
        </>
      )}
    </>
  );
}
