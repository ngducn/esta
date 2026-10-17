'use client';

import type { IsoDate } from '@esta/core/date';
import { parseAreaInput } from '@esta/core/properties/area';
import type { Purpose } from '@esta/core/schemas/legal';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DateInput } from '@/components/date-input';
import { TextField } from '@/components/form-parts';
import { FormSelect } from '@/components/properties/address-picker';
import { Button } from '@/components/ui/button';
import type { LandUseCode } from '@/server/properties/legal';
import { LandUseCodePicker } from './land-use-code-picker';

export type PurposeDraft = { readonly key: number; readonly code: string; readonly areaText: string; readonly term: '' | 'long_term' | 'until'; readonly until: IsoDate | null };

export function purposeDraft(key: number, purpose?: Purpose): PurposeDraft {
  const term = purpose?.term;
  return {
    key,
    code: purpose?.land_use_code ?? '',
    areaText: purpose?.area_m2 === undefined ? '' : String(purpose.area_m2).replace('.', ','),
    term: term === undefined ? '' : term === 'long_term' ? 'long_term' : 'until',
    until: term === undefined || term === 'long_term' ? null : term,
  };
}

export type PurposeInvalid = { readonly key: number; readonly field: 'code' | 'area' | 'until' };

export function readPurposes(drafts: readonly PurposeDraft[]): { ok: true; value: Purpose[] } | { ok: false; invalid: PurposeInvalid } {
  const value: Purpose[] = [];
  for (const draft of drafts) {
    const code = draft.code.trim().toUpperCase();
    if (code === '') return { ok: false, invalid: { key: draft.key, field: 'code' } };
    const area = draft.areaText.trim() === '' ? null : parseAreaInput(draft.areaText);
    if (area !== null && !area.ok) return { ok: false, invalid: { key: draft.key, field: 'area' } };
    if (draft.term === 'until' && draft.until === null) return { ok: false, invalid: { key: draft.key, field: 'until' } };
    value.push({
      land_use_code: code,
      ...(area === null ? {} : { area_m2: area.value }),
      ...(draft.term === 'long_term' ? { term: 'long_term' } : draft.term === 'until' && draft.until !== null ? { term: draft.until } : {}),
    });
  }
  return { ok: true, value };
}

export function PurposeRows({
  drafts,
  onChange,
  onAdd,
  codes,
  locale,
  invalid,
}: {
  drafts: readonly PurposeDraft[];
  onChange: (drafts: readonly PurposeDraft[]) => void;
  onAdd: () => void;
  codes: readonly LandUseCode[];
  locale: string;
  invalid: PurposeInvalid | null;
}) {
  const t = useTranslations('propertyLegal');
  const update = (key: number, patch: Partial<PurposeDraft>) => onChange(drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {drafts.map((draft, index) => (
          <li key={draft.key} data-testid="purpose-row" aria-label={t('purposeRow', { index: index + 1 })} className="flex flex-col gap-3 rounded-md border border-rule p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <LandUseCodePicker
                value={draft.code}
                onChange={(code) => update(draft.key, { code })}
                codes={codes}
                locale={locale}
                label={t('purposeCode')}
                invalid={invalid?.key === draft.key && invalid.field === 'code'}
              />
              <TextField
                label={t('purposeArea')}
                testId="purpose-area"
                value={draft.areaText}
                maxLength={20}
                inputMode="decimal"
                className="figures"
                error={invalid?.key === draft.key && invalid.field === 'area' ? t('areaInvalid', { reason: 'invalid' }) : null}
                onChange={(areaText) => update(draft.key, { areaText })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormSelect
                label={t('purposeTerm')}
                value={draft.term}
                options={[
                  { value: '', label: t('useFormNone') },
                  { value: 'long_term', label: t('purposeTermLong') },
                  { value: 'until', label: t('purposeTermUntil') },
                ]}
                onChange={(term) => update(draft.key, { term: term === 'long_term' || term === 'until' ? term : '' })}
              />
              {draft.term === 'until' ? (
                <DateInput label={t('purposeTermUntil')} {...(draft.until === null ? {} : { defaultValue: draft.until })} onValueChange={(until) => update(draft.key, { until })} />
              ) : null}
            </div>
            <Button
              type="button"
              variant="quiet"
              className="self-start"
              onClick={() => onChange(drafts.filter((other) => other.key !== draft.key))}
            >
              <X aria-hidden="true" />
              {t('removePurpose', { code: draft.code.trim() === '' ? String(index + 1) : draft.code.trim().toUpperCase() })}
            </Button>
          </li>
        ))}
      </ol>
      <Button type="button" variant="outline" className="self-start" onClick={onAdd} data-testid="add-purpose">
        <Plus aria-hidden="true" />
        {t('addPurpose')}
      </Button>
    </div>
  );
}
