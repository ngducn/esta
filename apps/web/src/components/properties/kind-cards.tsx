'use client';

import { PROPERTY_KINDS, type PropertyKind } from '@esta/core/properties/form';
import { useTranslations } from 'next-intl';
import { SelectionCards } from '@/components/selection-card';
import { kindIcons } from './kind-icons';

export function KindCards({ value, onChange }: { value: PropertyKind; onChange: (kind: PropertyKind) => void }) {
  const t = useTranslations('propertyForm');
  const tp = useTranslations('properties');
  return (
    <SelectionCards
      legend={t('kind')}
      testId="kind-select"
      narrow
      options={PROPERTY_KINDS.map((kind) => ({ value: kind, title: tp('kind', { kind }), icon: kindIcons[kind] }))}
      value={value}
      onChange={(next) => onChange(PROPERTY_KINDS.find((option) => option === next) ?? value)}
    />
  );
}
