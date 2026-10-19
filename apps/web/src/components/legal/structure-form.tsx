'use client';

import { measureInputText, parseMeasureInput } from '@esta/core/parse/measure';
import type { Structure } from '@esta/core/schemas/legal';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Group, TextField } from '@/components/form-parts';
import { FormSelect } from '@/components/properties/address-picker';
import { LegalFormShell } from './legal-form-shell';
import type { CertificateOption } from './parcel-form';

type Field = 'kind' | 'floorArea' | 'footprint' | 'floors' | 'completedYear';

const text = (value: number | null) => (value === null ? '' : measureInputText(value));
const WHOLE = /^[0-9]{1,4}$/;

function readArea(value: string) {
  return value.trim() === '' ? { ok: true as const, value: null } : parseMeasureInput(value, 'area');
}

function readWhole(value: string, min: number, max: number): { ok: true; value: number | null } | { ok: false } {
  const trimmed = value.trim();
  if (trimmed === '') return { ok: true, value: null };
  const number = WHOLE.test(trimmed) ? Number(trimmed) : Number.NaN;
  return number >= min && number <= max ? { ok: true, value: number } : { ok: false };
}

export function StructureForm({
  propertyId,
  itemId,
  initial,
  certificates,
}: {
  propertyId: string;
  itemId: string | null;
  initial: Structure | null;
  certificates: readonly CertificateOption[];
}) {
  const t = useTranslations('propertyLegal');
  const [values, setValues] = useState({
    kind: initial?.kind ?? '',
    floorArea: text(initial?.floor_area_m2 ?? null),
    footprint: text(initial?.footprint_m2 ?? null),
    floors: text(initial?.floors ?? null),
    completedYear: text(initial?.completed_year ?? null),
    structureText: initial?.structure_text ?? '',
    ownershipTerm: initial?.ownership_term ?? '',
    certificateId: initial === null ? (certificates[0]?.id ?? '') : (initial.certificate_id ?? ''),
  });
  const [invalid, setInvalid] = useState<Field | null>(null);
  const set = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const floorArea = readArea(values.floorArea);
    const footprint = readArea(values.footprint);
    const floors = readWhole(values.floors, 1, 200);
    const completedYear = readWhole(values.completedYear, 1800, 2200);
    const wrong: Field | null =
      values.kind.trim() === '' ? 'kind' : !floorArea.ok ? 'floorArea' : !footprint.ok ? 'footprint' : !floors.ok ? 'floors' : !completedYear.ok ? 'completedYear' : null;
    setInvalid(wrong);
    if (wrong !== null || !floorArea.ok || !footprint.ok || !floors.ok || !completedYear.ok) return null;
    return {
      certificate_id: values.certificateId === '' ? null : values.certificateId,
      kind: values.kind,
      footprint_m2: footprint.value,
      floor_area_m2: floorArea.value,
      floors: floors.value,
      structure_text: values.structureText,
      completed_year: completedYear.value,
      ownership_term: values.ownershipTerm,
    };
  };

  return (
    <LegalFormShell propertyId={propertyId} kind="structures" itemId={itemId} read={submit}>
      <Group title={t('groupStructure')}>
        <TextField
          label={t('structureKind')}
          hint={t('structureKindHint')}
          inputId="structure-kind"
          value={values.kind}
          maxLength={120}
          error={invalid === 'kind' ? t('structureKindRequired') : null}
          onChange={set('kind')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('floorAreaLabel')}
            inputId="floor-area"
            value={values.floorArea}
            maxLength={20}
            inputMode="decimal"
            className="figures"
            error={invalid === 'floorArea' ? t('areaInvalid', { reason: 'invalid' }) : null}
            onChange={set('floorArea')}
          />
          <TextField
            label={t('footprintLabel')}
            inputId="footprint"
            value={values.footprint}
            maxLength={20}
            inputMode="decimal"
            className="figures"
            error={invalid === 'footprint' ? t('areaInvalid', { reason: 'invalid' }) : null}
            onChange={set('footprint')}
          />
          <TextField
            label={t('floorsLabel')}
            value={values.floors}
            maxLength={3}
            inputMode="numeric"
            className="figures"
            error={invalid === 'floors' ? t('numberInvalid') : null}
            onChange={set('floors')}
          />
          <TextField
            label={t('completedYearLabel')}
            value={values.completedYear}
            maxLength={4}
            inputMode="numeric"
            className="figures"
            error={invalid === 'completedYear' ? t('numberInvalid') : null}
            onChange={set('completedYear')}
          />
        </div>
        <TextField label={t('structureText')} value={values.structureText} maxLength={500} error={null} onChange={set('structureText')} />
        <TextField label={t('ownershipTerm')} value={values.ownershipTerm} maxLength={120} error={null} onChange={set('ownershipTerm')} />
        <FormSelect
          label={t('certificateLink')}
          value={values.certificateId}
          options={[{ value: '', label: t('certificateNone') }, ...certificates.map((option) => ({ value: option.id, label: option.label }))]}
          onChange={set('certificateId')}
        />
      </Group>
    </LegalFormShell>
  );
}
