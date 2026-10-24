'use client';

import { area } from '@turf/area';
import { kinks } from '@turf/kinks';
import { formatArea } from '@esta/core/format';
import { normalizeRing, ringToGeoJson, type GeoPoint } from '@esta/core/maps';
import { Eraser, PenLine, Save, SquareDashed, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId } from 'react';
import { EstimatePill } from '@/components/estimate-pill';
import { FieldMessage } from '@/components/field-message';
import { buttonVariants } from '@/components/ui/button-variants';
import { isLocale } from '@/i18n/locale';
import type { DrawMode } from './types';

export type RingCheck =
  | { readonly kind: 'empty' }
  | { readonly kind: 'too_few' }
  | { readonly kind: 'crossing' }
  | { readonly kind: 'valid'; readonly squareMeters: number };

/** What the panel may save: a ring with 3 distinct corners whose edges do not cross, and its estimated area. */
export function checkRing(ring: readonly GeoPoint[] | null): RingCheck {
  if (ring === null || ring.length === 0) return { kind: 'empty' };
  const normalized = normalizeRing(ring);
  if (!normalized.ok) return { kind: 'too_few' };
  const polygon = { type: 'Feature' as const, properties: {}, geometry: ringToGeoJson(normalized.value) };
  if (kinks(polygon).features.length > 0) return { kind: 'crossing' };
  return { kind: 'valid', squareMeters: area(polygon) };
}

export function PolygonEditor({
  saved,
  mode,
  draft,
  saving,
  onMode,
  onSave,
  onClear,
}: {
  saved: readonly GeoPoint[] | null;
  mode: DrawMode;
  draft: readonly GeoPoint[] | null;
  saving: boolean;
  onMode: (mode: DrawMode) => void;
  onSave: (ring: readonly GeoPoint[]) => void;
  onClear: () => void;
}) {
  const t = useTranslations('map');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : 'vi';
  const id = useId();
  const shown = mode === 'off' ? checkRing(saved) : checkRing(draft);
  const problem = shown.kind === 'crossing' ? t('selfCrossing') : shown.kind === 'too_few' && mode !== 'off' ? t('tooFewCorners') : null;

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-title`} className="text-body font-medium text-ink">
          {t('boundaryTitle')}
        </h3>
        {mode === 'off' ? null : <p className="text-small text-ink-muted">{mode === 'draw' ? t('drawHelp') : t('editHelp')}</p>}
      </div>

      <FieldMessage id={`${id}-message`} error={problem}>
        {shown.kind === 'valid' ? (
          <span data-testid="boundary-area" className="flex flex-wrap items-center gap-2 text-ink">
            <span className="figures">{t('area', { area: formatArea(Math.round(shown.squareMeters), locale) })}</span>
            <EstimatePill label={t('estimate')} />
          </span>
        ) : mode === 'off' ? (
          <span className="text-ink-muted">{t('boundaryNone')}</span>
        ) : null}
      </FieldMessage>

      <div className="flex flex-wrap gap-2">
        {mode === 'off' ? (
          saved === null ? (
            <button type="button" onClick={() => onMode('draw')} className={buttonVariants({ variant: 'outline' })}>
              <PenLine aria-hidden="true" />
              {t('drawBoundary')}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => onMode('edit')} className={buttonVariants({ variant: 'outline' })}>
                <SquareDashed aria-hidden="true" />
                {t('editBoundary')}
              </button>
              <button type="button" disabled={saving} onClick={onClear} className={buttonVariants({ variant: 'outline' })}>
                <Eraser aria-hidden="true" />
                {t('clearBoundary')}
              </button>
            </>
          )
        ) : (
          <>
            <button
              type="button"
              disabled={saving || shown.kind !== 'valid' || draft === null}
              aria-describedby={`${id}-message`}
              onClick={() => {
                if (draft !== null) onSave(draft);
              }}
              className={buttonVariants({ variant: 'primary' })}
            >
              <Save aria-hidden="true" />
              {t('saveBoundary')}
            </button>
            <button type="button" onClick={() => onMode('off')} className={buttonVariants({ variant: 'outline' })}>
              <X aria-hidden="true" />
              {t('cancel')}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
