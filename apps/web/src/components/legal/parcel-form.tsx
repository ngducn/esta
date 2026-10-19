'use client';

import { formatArea } from '@esta/core/format';
import { measureInputText, parseMeasureInput } from '@esta/core/parse/measure';
import { purposesMismatch } from '@esta/core/properties/area';
import { PARCEL_UNIDENTIFIED, USE_FORMS, newParcelSchema, type Parcel } from '@esta/core/schemas/legal';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Group, TextField } from '@/components/form-parts';
import { FormSelect } from '@/components/properties/address-picker';
import { StatusShape } from '@/components/status-mark';
import type { LandUseCode } from '@/server/properties/legal';
import { LegalFormShell } from './legal-form-shell';
import { PurposeRows, purposeDraft, readPurposes, type PurposeDraft, type PurposeInvalid } from './purpose-rows';

export type CertificateOption = { readonly id: string; readonly label: string };

const areaText = (area: number | null) => (area === null ? '' : measureInputText(area));

export function ParcelForm({
  propertyId,
  itemId,
  initial,
  codes,
  certificates,
}: {
  propertyId: string;
  itemId: string | null;
  initial: Parcel | null;
  codes: readonly LandUseCode[];
  certificates: readonly CertificateOption[];
}) {
  const t = useTranslations('propertyLegal');
  const locale = useLocale();
  const [parcelNo, setParcelNo] = useState(initial?.parcel_no ?? '');
  const [mapSheetNo, setMapSheetNo] = useState(initial?.map_sheet_no ?? '');
  const [area, setArea] = useState(areaText(initial?.area_m2 ?? null));
  const [useForm, setUseForm] = useState<string>(initial?.use_form ?? '');
  const [certificateId, setCertificateId] = useState(initial === null ? (certificates[0]?.id ?? '') : (initial.certificate_id ?? ''));
  const [originText, setOriginText] = useState(initial?.origin_text ?? '');
  const [purposes, setPurposes] = useState<readonly PurposeDraft[]>(() => (initial?.purposes ?? []).map((purpose, index) => purposeDraft(index, purpose)));
  const [nextKey, setNextKey] = useState(purposes.length);
  const [invalid, setInvalid] = useState<'area' | 'identity' | PurposeInvalid | null>(null);

  const parsedArea = area.trim() === '' ? null : parseMeasureInput(area, 'area');
  const read = readPurposes(purposes);
  const mismatch =
    parsedArea?.ok && read.ok ? purposesMismatch({ area_m2: parsedArea.value, purposes: read.value }) : null;

  const submit = () => {
    if (parsedArea !== null && !parsedArea.ok) {
      setInvalid('area');
      return null;
    }
    if (!read.ok) {
      setInvalid(read.invalid);
      return null;
    }
    const input = {
      certificate_id: certificateId === '' ? null : certificateId,
      parcel_no: parcelNo,
      map_sheet_no: mapSheetNo,
      area_m2: parsedArea === null ? null : parsedArea.value,
      use_form: USE_FORMS.find((form) => form === useForm) ?? null,
      purposes: read.value,
      origin_text: originText,
    };
    const checked = itemId === null ? newParcelSchema.safeParse(input) : null;
    if (checked !== null && !checked.success && checked.error.issues.some((issue) => issue.message === PARCEL_UNIDENTIFIED)) {
      setInvalid('identity');
      return null;
    }
    setInvalid(null);
    return input;
  };

  return (
    <LegalFormShell propertyId={propertyId} kind="parcels" itemId={itemId} read={submit}>
      <Group title={t('groupParcel')}>
        {invalid === 'identity' ? (
          <p data-testid="parcel-unidentified" role="alert" className="flex items-start gap-2 text-body text-overdue">
            <StatusShape status="overdue" className="mt-1 size-4" />
            <span>{t('parcelUnidentified')}</span>
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('parcelNo')} inputId="parcel-no" value={parcelNo} maxLength={20} error={null} onChange={setParcelNo} />
          <TextField label={t('mapSheetNo')} inputId="map-sheet-no" value={mapSheetNo} maxLength={20} error={null} onChange={setMapSheetNo} />
        </div>
        <TextField
          label={t('area')}
          hint={t('areaHint')}
          inputId="parcel-area"
          value={area}
          maxLength={20}
          inputMode="decimal"
          className="max-w-60 figures"
          error={invalid === 'area' && parsedArea !== null && !parsedArea.ok ? t('areaInvalid', { reason: parsedArea.reason }) : null}
          onChange={setArea}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormSelect
            label={t('useFormLabel')}
            value={useForm}
            options={[{ value: '', label: t('useFormNone') }, ...USE_FORMS.map((form) => ({ value: form, label: t('useForm', { form }) }))]}
            onChange={setUseForm}
          />
          <FormSelect
            label={t('certificateLink')}
            value={certificateId}
            options={[{ value: '', label: t('certificateNone') }, ...certificates.map((option) => ({ value: option.id, label: option.label }))]}
            onChange={setCertificateId}
          />
        </div>
        <TextField label={t('originText')} value={originText} maxLength={500} error={null} onChange={setOriginText} />
      </Group>
      <Group title={t('groupPurposes')}>
        <PurposeRows
          drafts={purposes}
          onChange={setPurposes}
          onAdd={() => {
            setPurposes([...purposes, purposeDraft(nextKey)]);
            setNextKey(nextKey + 1);
          }}
          codes={codes}
          locale={locale}
          invalid={typeof invalid === 'object' ? invalid : null}
        />
        {mismatch === null ? null : (
          <p data-testid="purposes-mismatch" role="status" className="flex items-start gap-2 text-body text-ink">
            <StatusShape status="due" className="mt-0.5 size-4" />
            <span>
              {t('mismatch')}{' '}
              <span className="figures">{t('mismatchTotals', { purposes: formatArea(mismatch.purposes, locale), parcel: formatArea(mismatch.parcel, locale) })}</span>
            </span>
          </p>
        )}
      </Group>
    </LegalFormShell>
  );
}
