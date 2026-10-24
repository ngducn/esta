'use client';

import { isIsoDate, type IsoDate } from '@esta/core/date';
import { formatDate, formatDateLong } from '@esta/core/format';
import { parseDateInput } from '@esta/core/parse/date-input';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { FieldMessage } from '@/components/field-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSettled } from '@/components/use-settled';

type DateInputProps = {
  label: string;
  defaultValue?: IsoDate;
  onValueChange?: (value: IsoDate | null) => void;
  /** The text as typed, for a form that must tell an empty field from one that does not read as a date. */
  onTextChange?: (text: string) => void;
  name?: string;
  disabled?: boolean;
};

/** Takes `dd/mm/yyyy` typed or picked from the device's own calendar, and emits an `IsoDate`. */
export function DateInput({ label, defaultValue, onValueChange, onTextChange, name, disabled = false }: DateInputProps) {
  const t = useTranslations('components.date');
  const locale = useLocale();
  const id = useId();
  const picker = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(defaultValue === undefined ? '' : formatDate(defaultValue, locale));
  const { settled, settle } = useSettled(text);

  const result = parseDateInput(text);
  const error = !result.ok && result.reason !== 'empty' && settled ? `${t('invalid')} ${t(`reasons.${result.reason}`)}` : null;

  const change = (next: string) => {
    setText(next);
    onTextChange?.(next);
    const parsed = parseDateInput(next);
    onValueChange?.(parsed.ok ? parsed.value : null);
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body font-medium text-ink">
        {label}
      </label>
      <p id={`${id}-hint`} className="text-small text-ink-muted">
        {t('examples')}
      </p>
      <div className="mt-1 flex gap-2">
        <Input
          id={id}
          value={text}
          onChange={(event) => change(event.target.value)}
          onBlur={settle}
          disabled={disabled}
          placeholder={t('placeholder')}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={`${id}-hint ${id}-message`}
          className="max-w-48 figures"
        />
        <span className="relative">
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              const input = picker.current;
              if (input && typeof input.showPicker === 'function') input.showPicker();
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M4 6.5h16v13H4zM4 10.5h16M8.5 4v4M15.5 4v4" />
            </svg>
            {t('pick')}
          </Button>
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            disabled={disabled}
            value={result.ok ? result.value : ''}
            onChange={(event) => {
              if (isIsoDate(event.target.value)) change(formatDate(event.target.value, locale));
            }}
            className="pointer-events-none absolute inset-0 opacity-0"
          />
        </span>
      </div>
      {name === undefined ? null : <input type="hidden" name={name} value={result.ok ? result.value : ''} />}
      <FieldMessage id={`${id}-message`} error={error}>
        {result.ok ? (
          <time dateTime={result.value} data-testid="date-preview" className="text-ink">
            {formatDateLong(result.value, locale)}
          </time>
        ) : null}
      </FieldMessage>
    </div>
  );
}
