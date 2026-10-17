'use client';

import type { GeoPoint } from '@esta/core/maps';
import { useTranslations } from 'next-intl';
import { FieldMessage } from '@/components/field-message';
import { LocationPanel } from './location-panel';
import { PasteMapsLink, type LinkPreview } from './paste-maps-link';
import { PinEditor } from './pin-editor';
import { PolygonEditor } from './polygon-editor';
import type { DrawMode } from './types';

export type LocationToolsProps = {
  nickname: string;
  address: string;
  closeHref: string;
  pin: GeoPoint | null;
  boundary: readonly GeoPoint[] | null;
  preview: LinkPreview | null;
  draw: DrawMode;
  ring: GeoPoint[] | null;
  failed: boolean;
  saving: boolean;
  onPreview: (preview: LinkPreview | null) => void;
  onDraw: (draw: DrawMode) => void;
  onSavePin: (point: GeoPoint) => void;
  onSaveBoundary: (ring: readonly GeoPoint[] | null) => void;
};

/** The location panel's tools, turf and the form primitives load only when a property's location is opened, never with the pins. */
export function LocationTools({ nickname, address, closeHref, pin, boundary, preview, draw, ring, failed, saving, onPreview, onDraw, onSavePin, onSaveBoundary }: LocationToolsProps) {
  const t = useTranslations('map');
  return (
    <LocationPanel nickname={nickname} address={address} closeHref={closeHref}>
      <PasteMapsLink preview={preview} saving={saving} onPreview={onPreview} onSave={onSavePin} />
      <PinEditor key={pin === null ? 'none' : `${pin.lat},${pin.lng}`} pin={pin} saving={saving} onSave={onSavePin} />
      <PolygonEditor saved={boundary} mode={draw} draft={ring} saving={saving} onMode={onDraw} onSave={onSaveBoundary} onClear={() => onSaveBoundary(null)} />
      {failed ? <FieldMessage id="location-save-failed" error={t('saveFailed')} /> : null}
    </LocationPanel>
  );
}
