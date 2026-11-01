'use client';

import { formatVnd, vndInWords } from '@esta/core/format';
import type { Vnd } from '@esta/core/money';
import { parseStorableVnd, parseVndInput } from '@esta/core/parse/vnd-input';
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
  /**
   * Says the amount in words under the `=` line, as a receipt prints it. Words exist only for an amount Esta can store,
   * so the field then reads with `parseStorableVnd` and refuses 0 and anything over 1.000 tỷ.
   */
  words?: boolean;
  /** A refusal the form found on save, such as an amount of 0; it shows in place of the field's own reading error. */
  error?: string | null;
};

/** Reads Vietnamese shorthand and shows the full amount it read under the field. */
export function MoneyInput({ label, defaultText = '', onValueChange, onTextChange, name, disabled = false, large = false, words = false, error: refusal = null }: MoneyInputProps) {
  const t = useTranslations('components.money');
  const locale = useLocale();
  const id = useId();
  const [text, setText] = useState(defaultText);
  const { settled, settle } = useSettled(text);
  const read = words ? parseStorableVnd : parseVndInput;

  const result = read(text);
  const error = refusal ?? (!result.ok && result.reason !== 'empty' && settled ? `${t('invalid')} ${t(`reasons.${result.reason}`)}` : null);
  const spoken = words && result.ok && error === null ? vndInWords(result.value, locale) : null;

  const input = (
    <Input
      id={id}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onTextChange?.(event.target.value);
        const next = read(event.target.value);
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
      aria-describedby={`${id}-hint ${id}-message${spoken === null ? '' : ` ${id}-words`}`}
      className={cn(large ? 'min-h-control-lg rounded-none border-0 bg-transparent px-0 text-figure-lg num focus-visible:outline-none disabled:bg-transparent' : 'mt-1')}
    />
  );

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body font-medium text-text">
        {label}
      </label>
      <p id={`${id}-hint`} className="text-body-sm text-text-muted">
        {t('examples')}
      </p>
      {large ? (
        <div
          className={cn(
            'mt-1 flex min-h-control-lg items-center gap-2 rounded-md border border-border-field bg-surface px-4 transition-colors duration-(--duration-fast) ease-standard hover:border-text-muted',
            'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus-ring',
            error !== null && 'border-danger-text hover:border-danger-text',
            disabled && 'border-border bg-fill-disabled hover:border-border',
          )}
        >
          {input}
          <span aria-hidden="true" className={cn('text-title-3 font-medium', disabled ? 'text-text-disabled' : 'text-text-secondary')}>
            ₫
          </span>
        </div>
      ) : (
        input
      )}
      {name === undefined ? null : <input type="hidden" name={name} value={result.ok ? result.value : ''} />}
      <FieldMessage id={`${id}-message`} error={error}>
        {result.ok ? (
          <>
            <span aria-hidden="true" className="text-text-muted">
              =
            </span>
            <data value={result.value} data-testid="money-preview" className="text-headline text-text num">
              {formatVnd(result.value, locale)}
            </data>
          </>
        ) : null}
      </FieldMessage>
      {spoken === null ? null : (
        <p id={`${id}-words`} data-testid="money-words" className="-mt-1 text-body-sm text-text-secondary">
          {spoken}
        </p>
      )}
    </div>
  );
}
