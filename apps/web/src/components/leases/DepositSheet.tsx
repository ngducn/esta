'use client';

import { depositPrefill, previewDepositEntry, type DepositKind, type DepositState, type OpenInvoice } from '@esta/core/allocation';
import type { IsoDate } from '@esta/core/date';
import { formatDate, formatVnd } from '@esta/core/format';
import type { Vnd } from '@esta/core/money';
import { parseDateInput } from '@esta/core/parse/date-input';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import { vndInputText } from '@esta/core/properties/form';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { DateInput } from '@/components/date-input';
import { FormAlert } from '@/components/form-alert';
import { TextField } from '@/components/form-parts';
import { MoneyInput } from '@/components/money/money-input';
import { StatusShape } from '@/components/status-shape';
import { buttonVariants } from '@/components/ui/button-variants';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useNoticeToast } from '@/components/undo-toast';
import { useAction } from '@/components/use-action';
import { cn } from '@/lib/utils';
import { recordDeposit, type RecordDepositRefusal } from '@/server/actions/deposits';
import type { DepositOffer, DepositRowView } from './DepositLedger';

export type DepositInvoice = OpenInvoice & { readonly periodEnd: IsoDate };

type SheetError = 'amountMissing' | 'amountInvalid' | 'dateMissing' | 'dateInvalid' | 'dateAfterToday' | 'noteRequired' | 'invoice' | 'notActive' | 'changed' | 'failed';

/** A refusal past the held balance or the invoice's debt means the ledger or the invoice changed after the sheet opened. */
const SERVER_ERRORS = {
  amount: 'amountInvalid',
  date: 'dateInvalid',
  dateAfterToday: 'dateAfterToday',
  noteRequired: 'noteRequired',
  exceedsHeld: 'changed',
  exceedsOutstanding: 'changed',
  invoice: 'invoice',
  notActive: 'notActive',
  failed: 'failed',
} as const satisfies Record<RecordDepositRefusal, SheetError>;

const OVERDRAW_ERRORS = { too_large: 'tooLarge', exceeds_held: 'exceedsHeld', exceeds_outstanding: 'exceedsOutstanding' } as const;

/**
 * One sheet for the four deposit actions. It opens with `depositPrefill`'s amount, and `previewDepositEntry` shows the
 * held balance after this entry or the refusal `record_deposit_entry` and `apply_deposit` would give, before saving.
 * One opening carries one idempotency key, so a second tap or a retry writes nothing new. A save's revalidation redraws
 * the ledger behind the sheet; a refusal because the ledger changed refreshes it, so Mẹ sees the new numbers there.
 */
export default function DepositSheet({
  kind,
  open,
  onOpenChange,
  offer,
  state,
  rows,
  contractVnd,
}: {
  kind: DepositKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: DepositOffer;
  state: DepositState;
  rows: readonly DepositRowView[];
  contractVnd: Vnd | null;
}) {
  const t = useTranslations('deposits');
  const locale = useLocale();
  const router = useRouter();
  const notice = useNoticeToast();
  const title = useRef<HTMLHeadingElement>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [invoiceId, setInvoiceId] = useState(() => offer.openInvoices[0]?.id ?? null);
  const invoice = offer.openInvoices.find((candidate) => candidate.id === invoiceId);
  const prefill = (owed: DepositInvoice | undefined) => {
    const amount = depositPrefill(kind, state, contractVnd, owed?.outstandingVnd ?? null);
    return amount === null ? '' : vndInputText(amount);
  };
  const [amount, setAmount] = useState(() => prefill(invoice));
  const [date, setDate] = useState(() => formatDate(offer.today, locale));
  const [note, setNote] = useState('');
  const [error, setError] = useState<SheetError | null>(null);
  const { pending, run } = useAction();
  const money = (value: Vnd) => formatVnd(value, locale);

  const parsedAmount = parseVndInput(amount);
  const parsedDate = parseDateInput(date);
  const onDate = parsedDate.ok ? parsedDate.value : offer.today;
  const preview = parsedAmount.ok
    ? previewDepositEntry(rows, { id: idempotencyKey, kind, amountVnd: parsedAmount.value, onDate }, invoice?.outstandingVnd ?? null)
    : null;
  const overdraw = preview !== null && !preview.ok && preview.reason !== 'non_positive_amount' ? preview : null;

  const refuse = (): SheetError | null => {
    if (amount.trim() === '') return 'amountMissing';
    if (!parsedAmount.ok || (preview?.ok === false && preview.reason === 'non_positive_amount')) return 'amountInvalid';
    if (!parsedDate.ok) return parsedDate.reason === 'empty' ? 'dateMissing' : 'dateInvalid';
    if (parsedDate.value > offer.today) return 'dateAfterToday';
    if (kind === 'deduction' && note.trim() === '') return 'noteRequired';
    if (kind === 'applied' && invoice === undefined) return 'invoice';
    return null;
  };

  const save = () => {
    const refusal = refuse();
    setError(refusal);
    if (refusal !== null || overdraw !== null || !parsedAmount.ok) return;
    run(
      () => recordDeposit({ leaseId: offer.leaseId, kind, invoiceId, amount, onDate: date, note, idempotencyKey }),
      (result) => {
        if (!result.ok) {
          const shown = SERVER_ERRORS[result.reason];
          if (shown === 'changed') router.refresh();
          setError(shown);
          return;
        }
        notice(t('saved', { kind, amount: money(parsedAmount.value) }));
        onOpenChange(false);
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="deposit-sheet" data-kind={kind} initialFocus={title} className="gap-0 p-0 pb-0">
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <SheetTitle ref={title} tabIndex={-1} className="outline-none">
              {t('sheetTitle', { kind })}
            </SheetTitle>
            <SheetDescription>{t('sheetBody', { kind, unit: offer.unitLabel })}</SheetDescription>
          </div>

          {kind === 'applied' ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-2 text-body font-medium text-ink">{t('invoiceLegend')}</legend>
              {offer.openInvoices.map((candidate) => (
                <label
                  key={candidate.id}
                  className="flex min-h-touch cursor-pointer items-center gap-3 rounded-md border border-field bg-surface px-3 py-2.5 text-body text-ink has-checked:border-ink has-checked:bg-surface-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                >
                  <input
                    type="radio"
                    name={`deposit-invoice-${idempotencyKey}`}
                    value={candidate.id}
                    checked={invoiceId === candidate.id}
                    onChange={() => {
                      setInvoiceId(candidate.id);
                      setAmount(prefill(candidate));
                      setError(null);
                    }}
                    disabled={pending}
                    className="size-5 shrink-0 accent-accent"
                  />
                  <span className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-3">
                    <span className="figures">{t('invoiceOption', { start: formatDate(candidate.periodStart, locale), end: formatDate(candidate.periodEnd, locale) })}</span>
                    <span className="figures text-ink-2">{t('invoiceOwed', { amount: money(candidate.outstandingVnd) })}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <MoneyInput key={invoiceId ?? kind} label={t('amountLabel', { kind })} defaultText={amount} onTextChange={setAmount} disabled={pending} large />

          <div data-testid="deposit-preview" aria-live="polite" className="flex flex-col gap-0.5 rounded-md border border-rule bg-surface-2 px-4 py-3 text-body">
            <span className="text-ink-2 figures">{t('previewNow', { amount: money(state.heldVnd) })}</span>
            {preview?.ok === true ? (
              <span data-testid="deposit-held-after" className="font-medium text-ink figures">
                {t('previewAfter', { amount: money(preview.heldVnd) })}
              </span>
            ) : null}
            {overdraw === null ? null : (
              <span data-testid="deposit-overdraw" data-reason={overdraw.reason} className="flex items-start gap-2 font-medium text-overdue">
                <StatusShape status="overdue" className="mt-1 size-4" />
                <span className="figures">{t(`errors.${OVERDRAW_ERRORS[overdraw.reason]}`, { amount: money(overdraw.limitVnd) })}</span>
              </span>
            )}
          </div>

          <DateInput label={t('dateLabel', { kind })} defaultValue={offer.today} onTextChange={setDate} disabled={pending} />

          <TextField
            label={t('noteLabel', { kind })}
            {...(kind === 'deduction' ? { hint: t('noteHint') } : {})}
            value={note}
            onChange={(text) => {
              setNote(text);
              if (error === 'noteRequired') setError(null);
            }}
            error={error === 'noteRequired' ? t('errors.noteRequired') : null}
            testId="deposit-note"
            maxLength={1000}
          />
        </div>

        <div className="sticky bottom-0 mt-auto flex flex-col gap-3 border-t border-rule bg-surface px-5 pt-4 pb-[max(--spacing(5),env(safe-area-inset-bottom))] sm:px-6">
          <FormAlert message={error === null || error === 'noteRequired' ? null : t(`errors.${error}`)} data-testid="deposit-error" data-reason={error} />
          <div className="flex gap-2">
            <SheetClose className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>{t('cancel')}</SheetClose>
            <button
              type="button"
              data-testid="deposit-save"
              onClick={save}
              disabled={pending || overdraw !== null}
              className={cn(buttonVariants({ variant: 'primary' }), 'flex-[2]')}
            >
              {pending ? t('saving') : t('save', { kind })}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
