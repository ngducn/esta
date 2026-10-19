'use client';

import { allocatePayment, owedFor, owedThrough } from '@esta/core/allocation';
import type { IsoDate } from '@esta/core/date';
import { formatDate, formatMonthWithin, formatVnd } from '@esta/core/format';
import { firstOfMonth } from '@esta/core/date/calendar';
import { vnd, type Vnd } from '@esta/core/money';
import { parseDateInput } from '@esta/core/parse/date-input';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import { vndInputText } from '@esta/core/properties/form';
import { Banknote, Landmark, PiggyBank } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { DateInput } from '@/components/date-input';
import { MoneyInput } from '@/components/money/money-input';
import { StatusShape } from '@/components/status-mark';
import { buttonVariants } from '@/components/ui/button-variants';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useNoticeToast, useUndoToast } from '@/components/undo-toast';
import { useOnline } from '@/lib/use-online';
import { cn } from '@/lib/utils';
import { recordPayment, undoPayment, type PaymentMethod, type RecordPaymentRefusal } from '@/server/actions/payments';
import type { PaymentInvoice } from '@/server/collections/load';

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
export default function RecordPaymentSheet({ open, onOpenChange, target }: { open: boolean; onOpenChange: (open: boolean) => void; target: PaymentTarget }) {
  const t = useTranslations('payments');
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
  const [pending, startTransition] = useTransition();
  const offline = !useOnline();

  const parsed = parseVndInput(amount);
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
    if (amount.trim() === '') return t('errors.amountMissing');
    if (!parsed.ok) return t('errors.amountInvalid');
    if (method === null) return t('errors.method');
    const day = parseDateInput(date);
    if (!day.ok) return t(day.reason === 'empty' ? 'errors.dateMissing' : 'errors.dateInvalid');
    if (day.value > target.today) return t('errors.dateAfterToday');
    return pool.length === 0 ? t('errors.choice') : null;
  };

  const save = () => {
    const refusal = refuse();
    setError(refusal);
    if (refusal !== null || method === null) return;
    startTransition(async () => {
      const owedVnd = owedFor(openInvoices, target.invoiceId, chosen);
      const result = await recordPayment({ invoiceId: target.invoiceId, owedVnd, amount, method, receivedOn: date, idempotencyKey, invoiceIds: chosen }).catch(
        () => ({ ok: false, reason: 'failed' }) as const,
      );
      if (!result.ok) {
        if (isBoardChanged(result.reason)) {
          onOpenChange(false);
          router.refresh();
          showNotice(t(`errors.${result.reason}`, { place: target.shortPlace }));
        } else {
          setError(t(`errors.${REFUSAL_MESSAGES[result.reason]}`));
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
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="record-payment-sheet" initialFocus={title} className="gap-0 p-0 pb-0">
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <SheetTitle ref={title} tabIndex={-1} className="outline-none">
              {t('title')}
            </SheetTitle>
            <SheetDescription className="flex flex-col">
              <span data-testid="payment-place" className="font-semibold break-words text-ink">
                {target.place}
              </span>
              {target.tenantName === null ? null : <span className="break-words text-ink-2">{target.tenantName}</span>}
            </SheetDescription>
          </div>

          {offline ? (
            <p role="status" data-testid="payment-offline" className="rounded-md border border-rule bg-surface-2 px-4 py-3 text-body text-ink">
              {t('offline')}
            </p>
          ) : null}

          <MoneyInput label={t('amount')} defaultText={amount} onTextChange={setAmount} disabled={pending} large />

          {plan?.ok === true ? (
            <div data-testid="payment-allocation" className="flex flex-col gap-1 text-body">
              <p className="font-semibold text-ink">{t('allocation')}</p>
              <ul className="flex flex-col gap-0.5">
                {plan.value.allocations.map((allocation) => {
                  const invoice = byId.get(allocation.invoiceId);
                  if (invoice === undefined) return null;
                  const rest = invoice.outstandingVnd - allocation.amountVnd;
                  return (
                    <li key={allocation.invoiceId} className={cn('figures', rest > 0 ? 'font-semibold text-due' : 'text-ink-2')}>
                      {rest > 0
                        ? t('allocationShort', { month: month(invoice), amount: money(allocation.amountVnd), rest: money(vnd(rest)) })
                        : t('allocationSettled', { month: month(invoice), amount: money(allocation.amountVnd) })}
                    </li>
                  );
                })}
              </ul>
              {plan.value.creditVnd > 0 ? (
                <p data-testid="payment-credit" className="flex items-start gap-2 font-semibold text-ink">
                  <PiggyBank aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-muted" />
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
                className={cn(buttonVariants({ variant: 'quiet' }), 'self-start px-0')}
              >
                {choosing ? t('chooseDone') : t('choose')}
              </button>
              {choosing ? (
                <fieldset className="flex flex-col gap-1">
                  <legend className="text-small text-ink-muted">{t('chooseHint')}</legend>
                  {openInvoices.map((invoice) => (
                    <label key={invoice.id} className="flex min-h-touch items-center gap-2 text-body text-ink">
                      <Checkbox
                        checked={chosen === null || chosen.includes(invoice.id)}
                        onCheckedChange={(checked) => toggle(invoice.id, checked)}
                        aria-label={t('invoiceOption', { month: month(invoice), date: formatDate(invoice.dueDate, locale) })}
                      />
                      <span className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-3">
                        <span>{t('invoiceOption', { month: month(invoice), date: formatDate(invoice.dueDate, locale) })}</span>
                        <span className="figures text-ink-2">{t('invoiceOwed', { amount: money(invoice.outstandingVnd) })}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </div>
          ) : null}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-body font-semibold text-ink">{t('method')}</legend>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
              {METHODS.map(({ value, label, Icon }) => (
                <label
                  key={value}
                  className="flex min-h-touch cursor-pointer items-center gap-2 rounded-md border border-field bg-surface px-3 py-2.5 text-body font-semibold text-ink transition-colors duration-(--duration-fast) ease-standard hover:border-ink-muted has-checked:border-ink has-checked:bg-surface-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                >
                  <input
                    type="radio"
                    name={`method-${idempotencyKey}`}
                    value={value}
                    checked={method === value}
                    onChange={() => setMethod(value)}
                    disabled={pending}
                    className="size-5 shrink-0 accent-accent"
                  />
                  <Icon aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
                  <span className="min-w-0 break-words">{t(label)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {editingDate ? (
            <DateInput label={t('date')} defaultValue={target.today} onTextChange={setDate} disabled={pending} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-x-3 text-body">
              <p className="text-ink">
                <span className="font-semibold">{t('date')}</span>{' '}
                <span data-testid="payment-date" className="figures text-ink-2">
                  {t('dateToday', { date: formatDate(target.today, locale) })}
                </span>
              </p>
              <button type="button" data-testid="payment-change-date" onClick={() => setEditingDate(true)} className={cn(buttonVariants({ variant: 'quiet' }), 'px-0')}>
                {t('changeDate')}
              </button>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 mt-auto flex flex-col gap-3 border-t border-rule bg-surface px-5 pt-4 pb-[max(--spacing(5),env(safe-area-inset-bottom))] sm:px-6">
          {error === null ? null : (
            <p role="alert" data-testid="payment-error" className="flex items-start gap-2 text-body text-overdue">
              <StatusShape status="overdue" className="mt-1 size-4" />
              <span className="min-w-0 wrap-anywhere">{error}</span>
            </p>
          )}
          <div className="flex gap-2">
            <SheetClose className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>{t('cancel')}</SheetClose>
            <button type="button" data-testid="payment-save" onClick={save} disabled={pending} className={cn(buttonVariants({ variant: 'primary' }), 'flex-[2]')}>
              {pending ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
