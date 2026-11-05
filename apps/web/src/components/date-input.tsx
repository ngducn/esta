'use client';

import { isIsoDate, type IsoDate } from '@esta/core/date';
import { formatDate, formatDateLong } from '@esta/core/format';
import { parseDateInput } from '@esta/core/parse/date-input';
import { CalendarDays } from 'lucide-react';
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label text-text">
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={text}
          onChange={(event) => change(event.target.value)}
          onBlur={settle}
          disabled={disabled}
          placeholder={t('placeholder')}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={`${id}-message`}
          className="max-w-48 num"
        />
        <span className="relative">
          <Button
            type="button"
            variant="secondary"
            icon
            disabled={disabled}
            aria-label={t('pick')}
            onClick={() => {
              const input = picker.current;
              if (input && typeof input.showPicker === 'function') input.showPicker();
            }}
          >
            <CalendarDays aria-hidden="true" />
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
          <time dateTime={result.value} data-testid="date-preview" className="text-text">
            {formatDateLong(result.value, locale)}
          </time>
        ) : result.reason === 'empty' ? (
          <span className="text-text-muted">{t('examples')}</span>
        ) : null}
      </FieldMessage>
    </div>
  );
}
