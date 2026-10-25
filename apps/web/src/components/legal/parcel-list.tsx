import { formatArea, formatDate } from '@esta/core/format';
import { purposesMismatch, sumLandArea } from '@esta/core/properties/area';
import { getLocale, getTranslations } from 'next-intl/server';
import { StatusShape } from '@/components/status-shape';
import type { LegalRow } from '@esta/ops';
import type { LandUseCode } from '@/server/properties/legal';
import { LegalCard } from './legal-card';

export async function ParcelTotal({ parcels }: { parcels: readonly LegalRow<'parcels'>[] }) {
  const [t, locale] = await Promise.all([getTranslations('propertyLegal'), getLocale()]);
  return (
    <p data-testid="land-area-total" className="figures text-body font-medium text-ink">
      {t('totalLandArea', { area: formatArea(sumLandArea(parcels), locale) })}
    </p>
  );
}

export async function ParcelList({
  propertyId,
  parcels,
  codes,
  canEdit,
}: {
  propertyId: string;
  parcels: readonly LegalRow<'parcels'>[];
  codes: ReadonlyMap<string, LandUseCode>;
  canEdit: boolean;
}) {
  const [t, locale] = await Promise.all([getTranslations('propertyLegal'), getLocale()]);
  return (
    <ul className="flex flex-col gap-3">
      {parcels.map((parcel) => {
        const mismatch = purposesMismatch(parcel);
        return (
          <LegalCard
            key={parcel.id}
            propertyId={propertyId}
            kind="parcels"
            itemId={parcel.id}
            name={parcel.parcel_no ?? 'none'}
            canEdit={canEdit}
            title={t('parcelTitle', { number: parcel.parcel_no ?? 'none' })}
          >
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p data-testid="parcel-area" className="figures text-lead text-ink">
                {parcel.area_m2 === null ? t('noArea') : formatArea(parcel.area_m2, locale)}
              </p>
              {parcel.map_sheet_no === null ? null : <p className="text-body text-ink-2">{t('mapSheet', { sheet: parcel.map_sheet_no })}</p>}
              {parcel.use_form === null ? null : <p className="text-body text-ink-2">{t('useForm', { form: parcel.use_form })}</p>}
            </div>
            {parcel.purposes.length === 0 ? null : (
              <ul className="flex flex-col divide-y divide-rule rounded-md border border-rule">
                {parcel.purposes.map((purpose, index) => {
                  const known = codes.get(purpose.land_use_code);
                  return (
                    <li key={`${purpose.land_use_code}-${index}`} data-testid="purpose" data-code={purpose.land_use_code} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
                      <span className="figures text-body font-medium text-ink">{purpose.land_use_code}</span>
                      <span className={known === undefined ? 'text-small text-ink-muted italic' : 'text-body text-ink-2'}>
                        {known === undefined ? t('unknownCode') : locale === 'vi' ? known.nameVi : known.nameEn}
                      </span>
                      {purpose.area_m2 === undefined ? null : <span className="figures ml-auto text-body text-ink">{formatArea(purpose.area_m2, locale)}</span>}
                      {purpose.term === undefined ? null : (
                        <span className="w-full text-small text-ink-muted">
                          {purpose.term === 'long_term' ? t('termLong') : t('termUntil', { date: formatDate(purpose.term, locale) })}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {mismatch === null ? null : (
              <p data-testid="purposes-mismatch" className="flex items-start gap-2 text-body text-ink">
                <StatusShape status="due" className="mt-0.5 size-4" />
                <span>
                  {t('mismatch')}{' '}
                  <span className="figures">
                    {t('mismatchTotals', { purposes: formatArea(mismatch.purposes, locale), parcel: formatArea(mismatch.parcel, locale) })}
                  </span>
                </span>
              </p>
            )}
            {parcel.origin_text === null ? null : <p className="text-small break-words text-ink-2">{parcel.origin_text}</p>}
          </LegalCard>
        );
      })}
    </ul>
  );
}
