'use client';

import { toLatLng, type GeoPoint } from '@esta/core/maps';
import { Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { FieldMessage } from '@/components/field-message';
import { buttonVariants } from '@/components/ui/button-variants';
import { Input } from '@/components/ui/input';

const DECIMALS = 6;

/** Accepts the Vietnamese decimal comma as well as a point. */
function readCoordinate(text: string): number {
  const trimmed = text.trim().replace(',', '.');
  return /^[-+]?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

const show = (value: number | undefined) => (value === undefined ? '' : String(Number(value.toFixed(DECIMALS))));

/** Moves the pin from the keyboard; remount it with a new key when the saved pin moves so the fields follow the map. */
export function PinEditor({ pin, saving, onSave }: { pin: GeoPoint | null; saving: boolean; onSave: (point: GeoPoint) => void }) {
  const t = useTranslations('map');
  const id = useId();
  const [lat, setLat] = useState(show(pin?.lat));
  const [lng, setLng] = useState(show(pin?.lng));
  const [invalid, setInvalid] = useState(false);

  return (
    <form
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const point = toLatLng(readCoordinate(lat), readCoordinate(lng));
        setInvalid(!point.ok);
        if (point.ok) onSave({ lat: point.value.lat, lng: point.value.lng });
      }}
    >
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-title`} className="text-body font-semibold text-ink">
          {t('pinTitle')}
        </h3>
        <p className="text-small text-ink-muted">{pin === null ? t('pinHelpEmpty') : t('pinHelpPlaced')}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 min-[22rem]:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-small font-semibold text-ink">
          {t('latitude')}
          <Input
            name="lat"
            inputMode="decimal"
            autoComplete="off"
            value={lat}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            onChange={(event) => setLat(event.target.value)}
            className="figures font-normal"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-small font-semibold text-ink">
          {t('longitude')}
          <Input
            name="lng"
            inputMode="decimal"
            autoComplete="off"
            value={lng}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            onChange={(event) => setLng(event.target.value)}
            className="figures font-normal"
          />
        </label>
      </div>
      {invalid ? <FieldMessage id={`${id}-error`} error={t('coordinateInvalid')} /> : null}
      <button type="submit" disabled={saving} className={buttonVariants({ variant: 'outline' })}>
        <Save aria-hidden="true" />
        {t('savePin')}
      </button>
    </form>
  );
}
