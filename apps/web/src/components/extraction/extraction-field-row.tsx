'use client';

import type { FieldDecision } from '@esta/core/extraction/acceptance';
import { readArea } from '@esta/core/extraction/area-check';
import type { InputKind } from '@esta/core/extraction/fields';
import { isIsoDate } from '@esta/core/date';
import { formatArea } from '@esta/core/format';
import { Check, Pencil, Undo2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { DateInput } from '@/components/date-input';
import { LandUseCodePicker } from '@/components/legal/land-use-code-picker';
import { MoneyInput } from '@/components/money/money-input';
import { StatusShape, statusMarks } from '@/components/status-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { FieldView } from '@/server/extraction/field-views';
import type { LandUseCode } from '@/server/properties/legal';

export type RowError = 'invalid' | 'out_of_range' | 'missing' | 'national_id';

const ROW_ERRORS = {
  invalid: 'invalidField',
  out_of_range: 'outOfRangeField',
  missing: 'missingField',
  national_id: 'nationalIdField',
} as const satisfies Record<RowError, string>;

type Editor = 'select' | 'code' | 'date' | 'money' | { readonly inputMode: 'text' | 'decimal' | 'numeric'; readonly maxLength?: number };

/** How each kind of field is typed. A choice picks from its options; an ID keeps four digits at most (D11). */
const EDITORS: Readonly<Record<InputKind, Editor>> = {
  text: { inputMode: 'text' },
  term: { inputMode: 'text' },
  area: { inputMode: 'decimal' },
  number: { inputMode: 'decimal' },
  integer: { inputMode: 'numeric', maxLength: 4 },
  id_last4: { inputMode: 'numeric', maxLength: 4 },
  date: 'date',
  money: 'money',
  land_use_code: 'code',
  form: 'select',
  use_form: 'select',
  annotation_kind: 'select',
  utility_kind: 'select',
  boolean: 'select',
};

/** The area the row would save, for the parcel's area-sum check: what Mẹ typed, else what was read. */
export function rowArea(field: FieldView, decision: FieldDecision | undefined): number | null {
  return decision?.kind === 'edited' ? readArea(decision.value) : field.area;
}

/** What the row shows: Mẹ's edit, shown the way a read value would be, else the value read. */
function shown(field: FieldView, decision: FieldDecision | undefined, locale: 'vi' | 'en'): string | null {
  if (decision?.kind !== 'edited') return field.display;
  const text = decision.value.trim();
  if (text === '') return null;
  if (field.input === 'area') {
    const area = readArea(text);
    return area === null ? text : formatArea(area, locale);
  }
  if (field.input === 'land_use_code') return text.toUpperCase();
  return field.options?.find((option) => option.value === text)?.label ?? text;
}

export function ExtractionFieldRow({
  field,
  decision,
  editing,
  error,
  canEdit,
  landUseCodes,
  onDecide,
  onEdit,
  onPage,
}: {
  field: FieldView;
  decision: FieldDecision | undefined;
  editing: boolean;
  error: RowError | null;
  canEdit: boolean;
  landUseCodes: readonly LandUseCode[];
  onDecide: (decision: FieldDecision | undefined) => void;
  onEdit: (editing: boolean) => void;
  onPage: (page: number) => void;
}) {
  const t = useTranslations('extraction');
  const locale = useLocale() === 'en' ? 'en' : 'vi';
  const { input, label, page } = field;
  const value = shown(field, decision, locale);
  const unknownCode = input === 'land_use_code' && value !== null && !landUseCodes.some((option) => option.code === value);
  const unreadable = !field.readable && decision?.kind !== 'edited';
  const editor = EDITORS[input];
  const message = error !== null ? t(ROW_ERRORS[error]) : unreadable ? t('notReadable') : null;
  const edit = (text: string) => onDecide({ kind: 'edited', value: text });
  const startText = decision?.kind === 'edited' ? decision.value : field.editValue;

  return (
    <li
      data-testid="extraction-field"
      data-path={field.path}
      data-needs-check={field.marked}
      data-decision={decision?.kind ?? 'none'}
      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
          <p className="text-small font-semibold text-ink-muted">{label}</p>
          <p data-testid="field-value" className={cn('text-body break-words', value === null ? 'text-ink-muted' : 'text-ink')}>
            {value ?? t('empty')}
          </p>
          {unknownCode ? (
            <p data-testid="unknown-code" className="text-small text-ink-2 italic">
              {t('unknownCode')}
            </p>
          ) : null}
          {message === null ? null : (
            <p data-testid="field-error" className={cn('text-small font-semibold', error === null ? 'text-due' : 'text-overdue')}>
              {message}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {field.marked && decision === undefined ? (
            <span data-testid="needs-check" className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-small font-semibold', statusMarks.due.pill)}>
              <StatusShape status="due" className="size-4" />
              <span>{t('needsCheck')}</span>
            </span>
          ) : null}
          {decision === undefined ? null : (
            <span data-testid="decided" className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-small font-semibold', statusMarks.paid.pill)}>
              <StatusShape status="paid" className="size-4" />
              <span>{t('decision', { decision: decision.kind })}</span>
            </span>
          )}
          {page === null ? null : (
            <Button type="button" variant="quiet" data-testid="field-page" aria-label={t('pageLabel', { page, field: label })} onClick={() => onPage(page)}>
              {t('page', { page })}
            </Button>
          )}
        </div>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="field-correct"
            aria-label={t('correctLabel', { field: label })}
            aria-pressed={decision?.kind === 'accepted'}
            disabled={unreadable}
            onClick={() => {
              onDecide(decision?.kind === 'edited' ? decision : { kind: 'accepted' });
              onEdit(false);
            }}
          >
            <Check aria-hidden="true" />
            {t('correct')}
          </Button>
          <Button type="button" variant="outline" data-testid="field-edit" aria-label={t('editLabel', { field: label })} aria-expanded={editing} onClick={() => onEdit(!editing)}>
            <Pencil aria-hidden="true" />
            {t('edit')}
          </Button>
          {decision === undefined ? null : (
            <Button type="button" variant="quiet" data-testid="field-undo" onClick={() => onDecide(undefined)}>
              <Undo2 aria-hidden="true" />
              {t('undo')}
            </Button>
          )}
        </div>
      ) : null}
      {canEdit && editing ? (
        <div data-testid="field-editor" className="flex flex-col gap-3 rounded-md bg-surface-2 p-4">
          {editor === 'select' ? (
            <label className="flex flex-col gap-1">
              <span className="text-body font-semibold text-ink">{label}</span>
              <select
                className="min-h-touch rounded-md border border-field bg-surface px-3 text-body text-ink"
                defaultValue={startText}
                onChange={(event) => edit(event.target.value)}
              >
                <option value="">{t('optionNone')}</option>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : editor === 'code' ? (
            <LandUseCodePicker value={startText} onChange={edit} codes={landUseCodes} locale={locale} label={label} invalid={error !== null} />
          ) : editor === 'date' ? (
            <DateInput label={label} {...(isIsoDate(field.editValue) ? { defaultValue: field.editValue } : {})} onTextChange={edit} />
          ) : editor === 'money' ? (
            <MoneyInput label={label} defaultText={startText} onTextChange={edit} />
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-body font-semibold text-ink">{label}</span>
              <Input
                data-testid="field-input"
                defaultValue={startText}
                inputMode={editor.inputMode}
                maxLength={editor.maxLength}
                autoComplete="off"
                aria-invalid={error !== null}
                onChange={(event) => edit(event.target.value)}
              />
            </label>
          )}
          <Button type="button" variant="secondary" data-testid="field-done" className="self-start" onClick={() => onEdit(false)}>
            {t('done')}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
