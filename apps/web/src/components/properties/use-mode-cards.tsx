'use client';

import { USE_MODES, type UseMode } from '@esta/core/properties/form';
import { useTranslations } from 'next-intl';
import { SelectionCards } from '@/components/selection-card';
import { useModeIcons } from './kind-icons';

export function UseModeCards({ value, onChange }: { value: UseMode; onChange: (use: UseMode) => void }) {
  const t = useTranslations('propertyForm');
  const tp = useTranslations('properties');
  return (
    <SelectionCards
      legend={t('useMode')}
      testId="use-mode"
      options={USE_MODES.map((use) => ({ value: use, title: tp('use', { use }), description: t('useModeHelp', { use }), icon: useModeIcons[use] }))}
      value={value}
      onChange={(next) => onChange(USE_MODES.find((option) => option === next) ?? value)}
    />
  );
}
