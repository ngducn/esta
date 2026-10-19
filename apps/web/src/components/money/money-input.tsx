'use client';

import { formatVnd } from '@esta/core/format';
import type { Vnd } from '@esta/core/money';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { FieldMessage } from '@/components/field-message';
import { Input } from '@/components/ui/input';
import { useSettled } from '@/components/use-settled';
import { cn } from '@/lib/utils';

type MoneyInputProps = {
  label: string;
  /** The text in the field at first render, as a person would type it, for example `3tr5`. */
  defaultText?: string;
  onValueChange?: (value: Vnd | null) => void;
  /** The raw text, for a form that parses it again on submit and must tell an empty field from a wrong one. */
  onTextChange?: (text: string) => void;
  name?: string;
  disabled?: boolean;
  /** The figure-sized field of a sheet whose whole job is one amount, such as recording a payment. */
  large?: boolean;
  /** A refusal the form found on save, such as an amount of 0; it shows in place of the field's own reading error. */
  error?: string | null;
};

/** Reads Vietnamese shorthand through `parseVndInput` and shows the full amount it read under the field. */
export function MoneyInput({ label, defaultText = '', onValueChange, onTextChange, name, disabled = false, large = false, error: refusal = null }: MoneyInputProps) {
  const t = useTranslations('components.money');
  const locale = useLocale();
  const id = useId();
  const [text, setText] = useState(defaultText);
  const { settled, settle } = useSettled(text);

  const result = parseVndInput(text);
  const error = refusal ?? (!result.ok && result.reason !== 'empty' && settled ? `${t('invalid')} ${t(`reasons.${result.reason}`)}` : null);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body font-semibold text-ink">
        {label}
      </label>
      <p id={`${id}-hint`} className="text-small text-ink-muted">
        {t('examples')}
      </p>
      <Input
        id={id}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onTextChange?.(event.target.value);
          const next = parseVndInput(event.target.value);
          onValueChange?.(next.ok ? next.value : null);
        }}
        onBlur={settle}
        disabled={disabled}
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-invalid={error !== null}
        aria-describedby={`${id}-hint ${id}-message`}
        className={cn('mt-1', large && 'min-h-16 text-h2 font-bold figures')}
      />
      {name === undefined ? null : <input type="hidden" name={name} value={result.ok ? result.value : ''} />}
      <FieldMessage id={`${id}-message`} error={error}>
        {result.ok ? (
          <>
            <span aria-hidden="true" className="text-ink-muted">
              =
            </span>
            <data value={result.value} data-testid="money-preview" className="text-lead text-ink figures">
              {formatVnd(result.value, locale)}
            </data>
          </>
        ) : null}
      </FieldMessage>
    </div>
  );
}
