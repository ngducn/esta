'use client';

import { allocatePayment, owedFor, owedThrough } from '@esta/core/allocation';
import type { IsoDate } from '@esta/core/date';
import { formatDate, formatMonthWithin, formatVnd } from '@esta/core/format';
import { firstOfMonth } from '@esta/core/date/calendar';
import { vnd, type Vnd } from '@esta/core/money';
import { parseDateInput } from '@esta/core/parse/date-input';
import { parseStorableVnd } from '@esta/core/parse/vnd-input';
import { vndInputText } from '@esta/core/properties/form';
import { Banknote, Landmark, PiggyBank, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { DateInput } from '@/components/date-input';
import { MoneyInput } from '@/components/money/money-input';
import { SheetFooter } from '@/components/sheet-footer';
import type { PopupProps } from '@/components/use-deferred-dialog';
import { buttonVariants } from '@/components/ui/button-variants';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useNoticeToast, useUndoToast } from '@/components/undo-toast';
import { useAction } from '@/components/use-action';
import { useOnline } from '@/lib/use-online';
import { cn } from '@/lib/utils';
import { recordPayment, undoPayment, type PaymentMethod, type RecordPaymentRefusal } from '@/server/actions/payments';
import type { PaymentInvoice } from '@/server/collections/load';

/** The household's default receiving account, which a transfer names (PLT-1). */
export type PaymentAccount = { readonly id: string; readonly bankName: string; readonly accountNo: string };

/** The row a payment is recorded from, and every invoice its lease still owes. */
export type PaymentTarget = {
  readonly invoiceId: string;
  /** As the board names the row: `Phòng 5, Dãy trọ Dĩ An`, or the property for a whole unit. */
  readonly place: string;
  /** As the toast names it: `Phòng 5`, or the property for a whole unit. */
  readonly shortPlace: string;
  readonly tenantName: string | null;
  readonly openInvoices: readonly PaymentInvoice[];
  readonly today: IsoDate;
  readonly account: PaymentAccount | null;
};

const METHODS = [
  { value: 'cash', label: 'cash', Icon: Banknote },
  { value: 'bank_transfer', label: 'transfer', Icon: Landmark },
] as const satisfies readonly { value: PaymentMethod; label: 'cash' | 'transfer'; Icon: typeof Banknote }[];

/** Refusals that mean the board was out of date close the sheet onto the refreshed board, with a notice saying why. */
type BoardChanged = 'stale' | 'nothingOwed';
const isBoardChanged = (reason: RecordPaymentRefusal): reason is BoardChanged => reason === 'stale' || reason === 'nothingOwed';

const REFUSAL_MESSAGES = {
  amount: 'amountInvalid',
  date: 'dateInvalid',
  dateAfterToday: 'dateAfterToday',
  choice: 'choice',
  failed: 'failed',
} as const satisfies Record<Exclude<RecordPaymentRefusal, BoardChanged>, string>;

/**
 * LSE-7 from a collections row: the amount the row owes is already in the field, so `Tiền mặt` then `Lưu` records it.
 * The preview runs allocatePayment over the same open invoices `record_payment` settles, so what it shows is what is
 * written. One opening of the sheet carries one idempotency key, so a second tap or a retry records nothing new. The
 * sheet keeps the open invoices it opened with and sends what they owed, so `record_payment` can refuse it once someone
 * else has recorded the row.
 */
export default function RecordPaymentSheet({ open, onOpenChange, finalFocus, target }: PopupProps & { target: PaymentTarget }) {
  const t = useTranslations('payments');
  const tm = useTranslations('components.money');
  const locale = useLocale();
  const router = useRouter();
  const showUndo = useUndoToast();
  const showNotice = useNoticeToast();
  const title = useRef<HTMLHeadingElement>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [openInvoices] = useState(() => target.openInvoices);
  const [amount, setAmount] = useState(() => vndInputText(owedThrough(openInvoices, target.invoiceId)));
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [date, setDate] = useState(() => formatDate(target.today, locale));
  const [editingDate, setEditingDate] = useState(false);
  const [chosen, setChosen] = useState<readonly string[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { pending, run } = useAction();
  const offline = !useOnline();

  const parsed = parseStorableVnd(amount);
  const pool = chosen === null ? openInvoices : openInvoices.filter((invoice) => chosen.includes(invoice.id));
  const plan = parsed.ok && pool.length > 0 ? allocatePayment(parsed.value, pool) : null;
  const byId = new Map(openInvoices.map((invoice) => [invoice.id, invoice]));
  const month = (invoice: PaymentInvoice) => formatMonthWithin(firstOfMonth(invoice.dueDate), firstOfMonth(target.today), locale);
  const money = (value: Vnd) => formatVnd(value, locale);

  const toggle = (id: string, checked: boolean) => {
    const current = chosen ?? openInvoices.map((invoice) => invoice.id);
    const next = checked ? [...current, id] : current.filter((value) => value !== id);
    setChosen(next.length === openInvoices.length ? null : next);
  };

  const refuse = (): string | null => {
    if (!parsed.ok) return parsed.reason === 'empty' ? t('errors.amountMissing') : `${tm('invalid')} ${tm(`reasons.${parsed.reason}`)}`;
    if (method === null) return t('errors.method');
    const day = parseDateInput(date);
    if (!day.ok) return t(day.reason === 'empty' ? 'errors.dateMissing' : 'errors.dateInvalid');
    if (day.value > target.today) return t('errors.dateAfterToday');
    return pool.length === 0 ? t('errors.choice') : null;
  };

  const save = () => {
    const refusal = refuse();
    setError(refusal);
    setFailed(false);
    if (refusal !== null || method === null) return;
    const owedVnd = owedFor(openInvoices, target.invoiceId, chosen);
    const bankAccountId = method === 'bank_transfer' ? (target.account?.id ?? null) : null;
    run(
      () => recordPayment({ invoiceId: target.invoiceId, owedVnd, amount, method, receivedOn: date, idempotencyKey, invoiceIds: chosen, bankAccountId }),
      (result) => {
        if (!result.ok) {
          if (isBoardChanged(result.reason)) {
            onOpenChange(false);
            router.refresh();
            showNotice(t(`errors.${result.reason}`, { place: target.shortPlace }));
          } else {
            setError(t(`errors.${REFUSAL_MESSAGES[result.reason]}`));
            setFailed(result.reason === 'failed');
          }
          return;
        }
        onOpenChange(false);
        router.refresh();
        showUndo(t('saved', { amount: money(result.payment.amountVnd), place: target.shortPlace }), () => {
          undoPayment(result.payment.id)
            .then((undone) => {
              router.refresh();
              showNotice(t(undone.ok ? 'undone' : 'undoFailed', { place: target.shortPlace }));
            })
            .catch(() => showNotice(t('undoFailed')));
        });
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="record-payment-sheet" initialFocus={title} finalFocus={finalFocus} className="gap-0 p-0 pb-0 sm:p-0">
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <SheetTitle ref={title} tabIndex={-1} className="min-w-0 flex-1 outline-none">
                {t('title')}
              </SheetTitle>
              <SheetClose disabled={pending} data-testid="payment-close" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-my-1 -me-2 sm:px-0')}>
                <X aria-hidden="true" className="max-sm:hidden" />
                <span className="sm:sr-only">{t('close')}</span>
              </SheetClose>
            </div>
            <SheetDescription className="flex flex-col">
              <span data-testid="payment-place" className="font-medium break-words text-text">
                {target.place}
              </span>
              {target.tenantName === null ? null : <span className="break-words text-text-secondary">{target.tenantName}</span>}
            </SheetDescription>
          </div>

          {offline ? (
            <p role="status" data-testid="payment-offline" className="rounded-md border border-border bg-bg-subtle px-4 py-3 text-body text-text">
              {t('offline')}
            </p>
          ) : null}

          <MoneyInput label={t('amount')} defaultText={amount} onTextChange={setAmount} disabled={pending} large words />

          {plan?.ok === true ? (
            <div data-testid="payment-allocation" className="flex flex-col gap-1 text-body">
              <p className="font-medium text-text">{t('allocation')}</p>
              <ul className="flex flex-col gap-0.5">
                {plan.value.allocations.map((allocation) => {
                  const invoice = byId.get(allocation.invoiceId);
                  if (invoice === undefined) return null;
                  const rest = invoice.outstandingVnd - allocation.amountVnd;
                  return (
                    <li key={allocation.invoiceId} className={cn('num', rest > 0 ? 'font-medium text-warning-text' : 'text-text-secondary')}>
                      {rest > 0
                        ? t('allocationShort', { month: month(invoice), amount: money(allocation.amountVnd), rest: money(vnd(rest)) })
                        : t('allocationSettled', { month: month(invoice), amount: money(allocation.amountVnd) })}
                    </li>
                  );
                })}
              </ul>
              {plan.value.creditVnd > 0 ? (
                <p data-testid="payment-credit" className="flex items-start gap-2 font-medium text-text">
                  <PiggyBank aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text-muted" />
                  {target.tenantName === null
                    ? t('creditNoTenant', { amount: money(plan.value.creditVnd) })
                    : t('credit', { amount: money(plan.value.creditVnd), tenant: target.tenantName })}
                </p>
              ) : null}
            </div>
          ) : null}

          {openInvoices.length > 1 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                data-testid="payment-choose"
                aria-expanded={choosing}
                onClick={() => setChoosing((value) => !value)}
                className={cn(buttonVariants({ variant: 'ghost' }), 'self-start px-0')}
              >
                {choosing ? t('chooseDone') : t('choose')}
              </button>
              {choosing ? (
                <fieldset className="flex flex-col gap-1">
                  <legend className="text-body-sm text-text-muted">{t('chooseHint')}</legend>
                  {openInvoices.map((invoice) => (
                    <label key={invoice.id} className="flex min-h-touch items-center gap-2 text-body text-text">
                      <Checkbox
                        checked={chosen === null || chosen.includes(invoice.id)}
                        onCheckedChange={(checked) => toggle(invoice.id, checked)}
                        aria-label={t('invoiceOption', { month: month(invoice), date: formatDate(invoice.dueDate, locale) })}
                      />
                      <span className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-3">
                        <span>{t('invoiceOption', { month: month(invoice), date: formatDate(invoice.dueDate, locale) })}</span>
                        <span className="num text-text-secondary">{t('invoiceOwed', { amount: money(invoice.outstandingVnd) })}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </div>
          ) : null}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-body font-medium text-text">{t('method')}</legend>
            <div className="flex flex-wrap gap-0.5 rounded-md border border-border-strong bg-bg-subtle p-0.5">
              {METHODS.map(({ value, label, Icon }) => (
                <label
                  key={value}
                  className="flex min-h-10 min-w-36 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-transparent px-2 text-center text-label font-medium text-text-secondary transition-colors duration-(--duration-fast) ease-standard hover:bg-fill-hover hover:text-text has-checked:border-accent-border has-checked:bg-accent-subtle has-checked:font-semibold has-checked:text-accent-text has-disabled:cursor-not-allowed has-disabled:text-text-disabled has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-focus-ring"
                >
                  <input
                    type="radio"
                    name={`method-${idempotencyKey}`}
                    value={value}
                    checked={method === value}
                    onChange={() => setMethod(value)}
                    disabled={pending}
                    className="size-4 shrink-0 accent-accent focus-visible:outline-none"
                  />
                  <Icon aria-hidden="true" className="size-icon-sm shrink-0" />
                  <span className="min-w-0 break-words">{t(label)}</span>
                </label>
              ))}
            </div>
            {method === 'bank_transfer' && target.account !== null ? (
              <p data-testid="payment-account" className="num text-body text-text-secondary">
                {t('transferTo', { bank: target.account.bankName, accountNo: target.account.accountNo })}
              </p>
            ) : null}
          </fieldset>

          {editingDate ? (
            <DateInput label={t('date')} defaultValue={target.today} onTextChange={setDate} disabled={pending} />
          ) : (
            <div className="flex min-h-touch flex-wrap items-center gap-x-3">
              <span className="text-label font-medium text-text">{t('date')}</span>
              <span data-testid="payment-date" className="num flex-1 text-end text-body whitespace-nowrap text-text">
                {t('dateToday', { date: formatDate(target.today, locale) })}
              </span>
              <button
                type="button"
                data-testid="payment-change-date"
                onClick={() => setEditingDate(true)}
                disabled={pending}
                aria-label={t('changeDate')}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                {t('change')}
              </button>
            </div>
          )}
        </div>

        <SheetFooter
          error={error}
          labels={{ cancel: t('cancel'), save: t('save'), saving: t('saving'), retry: t('retry') }}
          pending={pending}
          failed={failed}
          closeInHead
          onSave={save}
          testId="payment"
        />
      </SheetContent>
    </Sheet>
  );
}
