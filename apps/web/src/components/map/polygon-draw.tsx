'use client';

import type { GeoPoint } from '@esta/core/maps';
import type { Map as MapLibre } from 'maplibre-gl';
import { useEffect, useEffectEvent } from 'react';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode, type GeoJSONStoreFeatures } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Theme } from '@/design/tokens';
import { tokenHex } from './map-style';

function openRing(feature: GeoJSONStoreFeatures | undefined): GeoPoint[] | null {
  if (feature?.geometry.type !== 'Polygon') return null;
  const outer = feature.geometry.coordinates[0] ?? [];
  return outer.slice(0, -1).map(([lng, lat]) => ({ lat: lat ?? Number.NaN, lng: lng ?? Number.NaN }));
}

/** Terra-draw on the map: `draw` starts an empty polygon, `edit` loads the saved boundary with draggable corners. */
export function BoundaryDrawing({
  map,
  theme,
  mode,
  boundary,
  onDraw,
}: {
  map: MapLibre;
  theme: Theme;
  mode: 'draw' | 'edit';
  boundary: readonly GeoPoint[] | null;
  onDraw: (ring: GeoPoint[] | null) => void;
}) {
  const report = useEffectEvent(onDraw);
  const initial = useEffectEvent(() => (mode === 'edit' ? boundary : null));

  useEffect(() => {
    const accent = tokenHex('accent', theme);
    const surface = tokenHex('surface', theme);
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new TerraDrawPolygonMode({
          styles: {
            fillColor: accent,
            fillOpacity: 0.16,
            outlineColor: accent,
            outlineWidth: 2.5,
            closingPointColor: surface,
            closingPointOutlineColor: accent,
            closingPointWidth: 7,
            closingPointOutlineWidth: 3,
          },
        }),
        new TerraDrawSelectMode({
          flags: { polygon: { feature: { selfIntersectable: true, coordinates: { draggable: true, midpoints: true, deletable: true } } } },
          styles: {
            selectedPolygonColor: accent,
            selectedPolygonFillOpacity: 0.16,
            selectedPolygonOutlineColor: accent,
            selectedPolygonOutlineWidth: 2.5,
            selectionPointColor: surface,
            selectionPointOutlineColor: accent,
            selectionPointWidth: 7,
            selectionPointOutlineWidth: 3,
            midPointColor: accent,
            midPointOutlineColor: surface,
            midPointWidth: 4,
          },
        }),
      ],
    });
    draw.start();

    const select = (id: string | number) => {
      draw.setMode('select');
      draw.selectFeature(id);
    };
    const saved = initial();
    const first = saved?.[0];
    if (saved !== null && first !== undefined && saved.length >= 3) {
      const coordinates = [[...saved, first].map(({ lat, lng }) => [lng, lat])];
      const [added] = draw.addFeatures([{ type: 'Feature', geometry: { type: 'Polygon', coordinates }, properties: { mode: 'polygon' } }]);
      if (added?.valid === true && added.id !== undefined) select(added.id);
      report(saved.slice());
    } else {
      draw.setMode('polygon');
      report(null);
    }

    draw.on('finish', (id) => {
      report(openRing(draw.getSnapshotFeature(id)));
      select(id);
    });
    draw.on('change', (ids, type) => {
      if (type !== 'update' || draw.getMode() !== 'select') return;
      const [id] = ids;
      if (id !== undefined) report(openRing(draw.getSnapshotFeature(id)));
    });
    return () => draw.stop();
  }, [map, theme, mode]);

  return null;
}
