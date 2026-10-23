'use client';

import type { IsoDate } from '@esta/core/date';
import { formatVndCompact } from '@esta/core/format';
import { MAX_SOURCE_URL, MAX_VALUATION_NOTE, readValuation, VALUATION_METHODS, type ValuationMethod, type ValuationProblems } from '@esta/core/valuations';
import { Check } from 'lucide-react';
import type { AbstractIntlMessages, Locale } from 'next-intl';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition, type RefObject } from 'react';
import { DateInput } from '@/components/date-input';
import { FieldMessage } from '@/components/field-message';
import { NoteField, TextField } from '@/components/form-parts';
import { MoneyInput } from '@/components/money/money-input';
import { PropertyIntl } from '@/components/properties/property-intl';
import { SheetFooter } from '@/components/sheet-footer';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useNoticeToast, useUndoToast } from '@/components/undo-toast';
import { createValuation, deleteValuation } from '@/server/actions/valuations';

export type ValuationScope = {
  readonly propertyId: string;
  readonly nickname: string;
  readonly today: IsoDate;
  readonly locale: Locale;
  readonly messages: AbstractIntlMessages;
};

type SheetProps = { scope: ValuationScope; valuationId: string; open: boolean; onOpenChange: (open: boolean) => void; finalFocus: RefObject<HTMLButtonElement | null> };

type Errors = ValuationProblems & { readonly method?: true; readonly save?: 'networkError' | 'forbidden' };

function ValuationSheet({ scope, valuationId, open, onOpenChange, finalFocus }: SheetProps) {
  const t = useTranslations('valuations');
  const tm = useTranslations('components.money');
  const locale = useLocale();
  const router = useRouter();
  const showUndo = useUndoToast();
  const showNotice = useNoticeToast();
  const fieldId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const [value, setValue] = useState('');
  const [method, setMethod] = useState<ValuationMethod | null>(null);
  const [asOf, setAsOf] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const clear = (field: keyof Errors) => setErrors(({ [field]: _, ...rest }) => rest);
  const typed = (set: (text: string) => void, field: keyof Errors) => (text: string) => {
    set(text);
    clear(field);
  };

  const valueError = (): string | null => {
    const problem = errors.value;
    if (problem === undefined) return null;
    if (problem === 'empty') return t('valueMissing');
    if (problem === 'not_positive') return t('valueNotPositive');
    return `${tm('invalid')} ${tm(`reasons.${problem}`)}`;
  };
  const dateError = errors.asOf === 'after_today' ? t('dateAfterToday') : null;

  const saved = (amount: string) =>
    showUndo(t('saved', { amount }), () => {
      deleteValuation({ id: valuationId })
        .then((undone) => {
          router.refresh();
          showNotice(undone.ok ? t('undoneSave', { amount }) : t('undoFailed'));
        })
        .catch(() => showNotice(t('undoFailed')));
    });

  const save = () => {
    const raw = { id: valuationId, propertyId: scope.propertyId, method: method ?? '', value, asOf, sourceUrl, note };
    const read = readValuation(raw, scope.today);
    const { form: _, ...fields }: Errors = { ...(read.ok ? {} : read.reason), ...(method === null ? { method: true } : {}) };
    setErrors(fields);
    if (!read.ok) return;
    startTransition(async () => {
      const result = await createValuation(raw).catch(() => null);
      if (result?.ok !== true) {
        const reason = result?.reason;
        setErrors(reason?.kind === 'fields' ? reason.problems : { save: reason?.kind === 'forbidden' ? 'forbidden' : 'networkError' });
        return;
      }
      onOpenChange(false);
      router.refresh();
      saved(formatVndCompact(read.value.valueVnd, locale));
    });
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <SheetContent data-testid="valuation-sheet" initialFocus={title} finalFocus={finalFocus} className="gap-0 p-0 pb-0">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <SheetTitle ref={title} tabIndex={-1} className="outline-none">
              {t('add')}
            </SheetTitle>
            <SheetDescription className="font-semibold break-words text-ink">{scope.nickname}</SheetDescription>
          </div>

          <MoneyInput label={t('value')} onTextChange={typed(setValue, 'value')} disabled={pending} error={valueError()} large />

          <fieldset className="flex flex-col gap-2" aria-describedby={`${fieldId}-method`}>
            <legend className="mb-2 text-body font-semibold text-ink">{t('methodLabel')}</legend>
            <div className="flex flex-wrap gap-2" data-testid="valuation-methods">
              {VALUATION_METHODS.map((option) => (
                <label
                  key={option}
                  className="flex min-h-touch cursor-pointer items-center gap-1.5 rounded-full border border-field bg-surface px-4 text-body font-semibold text-ink hover:border-ink-muted has-checked:border-ink has-checked:bg-ink has-checked:text-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                >
                  <input
                    type="radio"
                    name={`method-${valuationId}`}
                    value={option}
                    checked={method === option}
                    disabled={pending}
                    onChange={() => {
                      setMethod(option);
                      clear('method');
                    }}
                    className="peer sr-only"
                  />
                  <Check aria-hidden="true" className="hidden size-4 shrink-0 peer-checked:block" strokeWidth={2.5} />
                  {t('method', { method: option })}
                </label>
              ))}
            </div>
            <FieldMessage id={`${fieldId}-method`} error={errors.method === true ? t('methodMissing') : null} />
          </fieldset>

          <div className="flex flex-col gap-1">
            <DateInput label={t('date')} defaultValue={scope.today} onTextChange={typed(setAsOf, 'asOf')} disabled={pending} />
            {dateError === null ? null : <FieldMessage id={`${fieldId}-date`} error={dateError} />}
          </div>

          <TextField
            label={t('sourceLabel')}
            hint={`${t('sourceHint')} (${t('optional')})`}
            testId="valuation-source"
            value={sourceUrl}
            maxLength={MAX_SOURCE_URL}
            inputMode="url"
            error={errors.sourceUrl === undefined ? null : t('notHttps')}
            onChange={typed(setSourceUrl, 'sourceUrl')}
          />

          <NoteField labels={{ note: t('note'), optional: t('optional') }} value={note} onChange={setNote} maxLength={MAX_VALUATION_NOTE} disabled={pending} testId="valuation-note" />
        </div>

        <SheetFooter
          error={errors.save === undefined ? null : t(errors.save)}
          labels={{ cancel: t('cancel'), save: t('save'), saving: t('saving') }}
          pending={pending}
          onSave={save}
          testId="valuation"
        />
      </SheetContent>
    </Sheet>
  );
}

export default function ValuationIsland(props: SheetProps) {
  return (
    <PropertyIntl locale={props.scope.locale} messages={props.scope.messages}>
      <ValuationSheet {...props} />
    </PropertyIntl>
  );
}
