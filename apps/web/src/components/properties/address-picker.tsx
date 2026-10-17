'use client';

import { matchesSearch } from '@esta/core/search';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AdminUnitOption } from '@/server/address/suggest';
import type { AddressValue } from './property-form-values';

const LISTED = 60;

export function FormSelect({
  label,
  value,
  options,
  placeholder,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
  onChange: (value: string) => void;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body font-semibold text-ink">
        {label}
      </label>
      <div className="relative mt-1">
        <select
          id={id}
          data-testid={testId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-touch w-full appearance-none rounded-md border border-field bg-surface pr-10 pl-3.5 text-body text-ink hover:border-ink-muted"
        >
          {placeholder === undefined ? null : (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
      </div>
    </div>
  );
}

function CommuneCombobox({
  options,
  loading,
  disabled,
  value,
  onPick,
  onQuery,
  invalid,
}: {
  options: readonly AdminUnitOption[];
  loading: boolean;
  disabled: boolean;
  value: AddressValue;
  onPick: (option: AdminUnitOption) => void;
  onQuery: (query: string) => void;
  invalid: boolean;
}) {
  const t = useTranslations('propertyForm');
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const query = value.communeName;
  const matches = (value.communeCode === null ? options.filter((option) => matchesSearch(query, option.name)) : options).slice(0, LISTED);

  const pick = (option: AdminUnitOption) => {
    onPick(option);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.max(0, Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter' && open) {
      const option = matches[active];
      if (option !== undefined) {
        event.preventDefault();
        pick(option);
      }
    } else if (event.key === 'Escape') setOpen(false);
  };

  const hint = disabled ? t('communeNeedsProvince') : loading ? t('communeLoading') : t('communeHint');
  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className="text-body font-semibold text-ink">
        {t('commune')}
      </label>
      <p id={`${id}-hint`} className="text-small text-ink-muted">
        {hint}
      </p>
      <Input
        id={id}
        role="combobox"
        data-testid="commune-input"
        aria-expanded={open && matches.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] !== undefined ? `${id}-${matches[active].code}` : undefined}
        aria-describedby={`${id}-hint`}
        aria-invalid={invalid}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={query}
        onChange={(event) => {
          onQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="mt-1"
      />
      {open && !disabled && !loading ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={t('commune')}
          className="absolute top-full z-10 mt-1 max-h-72 w-full overflow-y-auto overscroll-contain rounded-md border border-rule bg-surface py-1 shadow-sheet"
        >
          {matches.length === 0 ? (
            <li className="px-3.5 py-2.5 text-body text-ink-muted">{t('communeNone')}</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.code}
                id={`${id}-${option.code}`}
                role="option"
                aria-selected={option.code === value.communeCode}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(option)}
                className={cn(
                  'flex min-h-touch cursor-pointer items-center justify-between gap-2 px-3.5 text-body text-ink',
                  index === active ? 'bg-surface-2' : 'hover:bg-surface-2',
                )}
              >
                <span className="min-w-0 wrap-anywhere">{option.name}</span>
                {option.code === value.communeCode ? <Check className="size-5 shrink-0 text-accent" aria-hidden="true" /> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** PRP-4: province first, then a ward or commune of that province, then the house number and street. */
export function AddressPicker({
  provinces,
  communes,
  loadingCommunes,
  value,
  onProvince,
  onChange,
  communeInvalid,
}: {
  provinces: readonly AdminUnitOption[];
  communes: readonly AdminUnitOption[];
  loadingCommunes: boolean;
  value: AddressValue;
  onProvince: (code: string) => void;
  onChange: (value: AddressValue) => void;
  communeInvalid: boolean;
}) {
  const t = useTranslations('propertyForm');
  const houseId = useId();
  const streetId = useId();
  return (
    <div className="flex flex-col gap-4">
      <FormSelect
        label={t('province')}
        testId="province-select"
        value={value.provinceCode ?? ''}
        placeholder={t('provincePlaceholder')}
        options={provinces.map((province) => ({ value: province.code, label: province.name }))}
        onChange={onProvince}
      />
      <CommuneCombobox
        options={communes}
        loading={loadingCommunes}
        disabled={value.provinceCode === null}
        value={value}
        invalid={communeInvalid}
        onQuery={(communeName) => onChange({ ...value, communeCode: null, communeName })}
        onPick={(option) => onChange({ ...value, communeCode: option.code, communeName: option.name })}
      />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-1">
          <label htmlFor={houseId} className="text-body font-semibold text-ink">
            {t('houseNo')}
          </label>
          <Input id={houseId} value={value.houseNo} autoComplete="off" onChange={(event) => onChange({ ...value, houseNo: event.target.value })} className="mt-1" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={streetId} className="text-body font-semibold text-ink">
            {t('street')}
          </label>
          <Input id={streetId} value={value.street} autoComplete="off" onChange={(event) => onChange({ ...value, street: event.target.value })} className="mt-1" />
        </div>
      </div>
    </div>
  );
}
