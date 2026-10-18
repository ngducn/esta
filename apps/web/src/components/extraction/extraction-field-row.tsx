'use client';

import type { FieldDecision } from '@esta/core/extraction/acceptance';
import { needsCheck } from '@esta/core/extraction/confidence';
import { INPUT_KINDS, type InputKind, type ReviewField } from '@esta/core/extraction/fields';
import { isIsoDate } from '@esta/core/date';
import { formatArea, formatDate, formatVnd } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { Check, Pencil, Undo2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId } from 'react';
import { DateInput } from '@/components/date-input';
import { LandUseCodePicker } from '@/components/legal/land-use-code-picker';
import { MoneyInput } from '@/components/money/money-input';
import { StatusShape, statusMarks } from '@/components/status-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { LandUseCode } from '@/server/properties/legal';

export type RowError = 'invalid' | 'missing';

type Editor = 'select' | 'code' | 'date' | 'money' | { readonly inputMode: 'text' | 'decimal' | 'numeric'; readonly maxLength?: number };

/** How each kind of field is typed. A choice reads from the kind's options; an ID keeps four digits at most (D11). */
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

const OPTION_KINDS = new Set<InputKind>(['form', 'use_form', 'annotation_kind', 'utility_kind', 'term']);

/** The value the field would save: what Mẹ typed when she edited it, else what the assistant read. */
export function currentValue(field: ReviewField, decision: FieldDecision | undefined) {
  const raw = decision?.kind === 'edited' ? decision.value : (field.leaf?.value ?? null);
  return { raw, parsed: INPUT_KINDS[field.descriptor.input].parse(raw) };
}

function useFormat() {
  const t = useTranslations('extraction');
  const locale = useLocale() === 'en' ? 'en' : 'vi';
  return (kind: InputKind, value: unknown): string => {
    if (kind === 'area' && typeof value === 'number') return formatArea(value, locale);
    if (kind === 'money' && typeof value === 'number') return formatVnd(vnd(value), locale);
    if (kind === 'date' && typeof value === 'string' && isIsoDate(value)) return formatDate(value, locale);
    if (kind === 'term' && typeof value === 'string' && isIsoDate(value)) return formatDate(value, locale);
    if (OPTION_KINDS.has(kind)) return t('option', { kind, value: String(value) });
    return String(value);
  };
}

/** Text for the editor to start from, in the form Mẹ would type it. */
function editText(kind: InputKind, value: unknown, format: (kind: InputKind, value: unknown) => string): string {
  if (value === null || value === undefined) return '';
  if (kind === 'area' || kind === 'number') return format('area', value).replace(/\s*m²$/u, '');
  if (kind === 'term' && typeof value === 'string' && isIsoDate(value)) return format('date', value);
  return String(value);
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
  field: ReviewField;
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
  const locale = useLocale();
  const format = useFormat();
  const id = useId();
  const { input, label: labelKey } = field.descriptor;
  const label = t(`fields.${labelKey}` as 'fields.form');
  const { raw, parsed } = currentValue(field, decision);
  const value = parsed.ok ? parsed.value : null;
  const marked = needsCheck(field) && decision === undefined;
  const page = field.leaf?.page ?? null;
  const unknownCode = input === 'land_use_code' && typeof value === 'string' && !landUseCodes.some((option) => option.code === value);
  const unreadable = !parsed.ok;
  const editor = EDITORS[input];
  const message = error === 'missing' ? t('missingField') : error === 'invalid' ? t('invalidField') : unreadable ? t('notReadable') : null;

  const edit = (text: string) => onDecide({ kind: 'edited', value: text });
  const startText = editText(input, decision?.kind === 'edited' ? decision.value : value, format);

  return (
    <li
      data-testid="extraction-field"
      data-path={field.path}
      data-needs-check={needsCheck(field)}
      data-decision={decision?.kind ?? 'none'}
      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
          <p id={`${id}-label`} className="text-small font-semibold text-ink-muted">
            {label}
          </p>
          <p data-testid="field-value" className={cn('text-body break-words', value === null && !unreadable ? 'text-ink-muted' : 'text-ink')}>
            {value !== null ? format(input, value) : unreadable ? String(raw) : t('empty')}
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
          {marked ? (
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
            disabled={unreadable && decision?.kind !== 'edited'}
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
                defaultValue={typeof value === 'string' ? value : ''}
                onChange={(event) => edit(event.target.value)}
              >
                <option value="">{t('optionNone')}</option>
                {(INPUT_KINDS[input].options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {t('option', { kind: input, value: option })}
                  </option>
                ))}
              </select>
            </label>
          ) : editor === 'code' ? (
            <LandUseCodePicker
              value={decision?.kind === 'edited' ? decision.value : startText}
              onChange={edit}
              codes={landUseCodes}
              locale={locale}
              label={label}
              invalid={error !== null}
            />
          ) : editor === 'date' ? (
            <DateInput label={label} {...(typeof value === 'string' && isIsoDate(value) ? { defaultValue: value } : {})} onTextChange={edit} />
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
