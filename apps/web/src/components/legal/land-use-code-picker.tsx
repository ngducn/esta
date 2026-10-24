'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import type { LandUseCode } from '@/server/properties/legal';

/** A typed code that the list lacks still saves as typed, with a hint (DOMAIN-VN §3). */
export function LandUseCodePicker({
  value,
  onChange,
  codes,
  locale,
  label,
  invalid,
}: {
  value: string;
  onChange: (code: string) => void;
  codes: readonly LandUseCode[];
  locale: string;
  label: string;
  invalid: boolean;
}) {
  const t = useTranslations('propertyLegal');
  const id = useId();
  const code = value.trim().toUpperCase();
  const known = codes.find((option) => option.code === code);
  const name = (option: LandUseCode) => (locale === 'vi' ? option.nameVi : option.nameEn);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body font-medium text-ink">
        {label}
      </label>
      <Input
        id={id}
        list={`${id}-codes`}
        value={value}
        maxLength={20}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-invalid={invalid}
        aria-describedby={`${id}-name`}
        data-testid="purpose-code"
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 uppercase figures"
      />
      <datalist id={`${id}-codes`}>
        {codes.map((option) => (
          <option key={option.code} value={option.code}>
            {`${option.code} ${name(option)}`}
          </option>
        ))}
      </datalist>
      <p id={`${id}-name`} data-testid="purpose-code-name" className={known === undefined ? 'text-small text-ink-muted italic' : 'text-small text-ink-2'}>
        {code === '' ? t('purposeCodeHint') : known === undefined ? t('unknownCode') : name(known)}
      </p>
    </div>
  );
}
