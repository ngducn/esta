'use client';

import { KIND_FIELDS, type KindDetailKey, type KindFieldTexts, type PropertyKind } from '@esta/core/properties/form';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { FieldMessage } from '@/components/field-message';
import { MoneyInput } from '@/components/money/money-input';
import { Input } from '@/components/ui/input';

const INPUT_MODE = { text: 'text', integer: 'numeric', meters: 'decimal' } as const;

function DetailInput({
  label,
  input,
  value,
  error,
  onChange,
  detailKey,
}: {
  label: string;
  input: 'text' | 'integer' | 'meters';
  value: string;
  error: string | null;
  onChange: (text: string) => void;
  detailKey: KindDetailKey;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body font-medium text-ink">
        {label}
      </label>
      <Input
        id={id}
        data-testid={`detail-${detailKey}`}
        value={value}
        inputMode={INPUT_MODE[input]}
        autoComplete="off"
        aria-invalid={error !== null}
        aria-describedby={input === 'text' ? undefined : `${id}-message`}
        onChange={(event) => onChange(event.target.value)}
        className={input === 'text' ? 'mt-1' : 'mt-1 max-w-48 figures'}
      />
      {input === 'text' ? null : <FieldMessage id={`${id}-message`} error={error} />}
    </div>
  );
}

/** Renders `KIND_FIELDS[kind]`, so a kind's fields are data in core and never a branch here (PRP-1). */
export function KindFields({
  kind,
  texts,
  invalid,
  onChange,
}: {
  kind: PropertyKind;
  texts: KindFieldTexts;
  invalid: KindDetailKey | null;
  onChange: (key: KindDetailKey, text: string) => void;
}) {
  const t = useTranslations('propertyForm');
  const fields = KIND_FIELDS[kind];
  if (fields.length === 0) return null;
  return (
    <div data-testid="kind-fields" data-kind={kind} className="grid gap-4 sm:grid-cols-2">
      {fields.map(({ key, input }) =>
        input === 'vnd' ? (
          <div key={`${kind}-${key}`} className="sm:col-span-2" data-testid={`detail-${key}`}>
            <MoneyInput label={t('detail', { key })} defaultText={texts[key] ?? ''} onTextChange={(text) => onChange(key, text)} />
          </div>
        ) : (
          <DetailInput
            key={`${kind}-${key}`}
            detailKey={key}
            label={t('detail', { key })}
            input={input}
            value={texts[key] ?? ''}
            error={invalid === key ? t('detailInvalid') : null}
            onChange={(text) => onChange(key, text)}
          />
        ),
      )}
    </div>
  );
}
