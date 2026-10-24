'use client';

import { defaultDocumentTitle } from '@esta/core/documents';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_IDS,
  MAX_EXPENSE_NOTE,
  MAX_VENDOR_NAME,
  readExpense,
  type ExpenseCategory,
  type ExpenseProblems,
  type ExpenseVendor,
} from '@esta/core/expenses';
import { formatDate, formatVnd } from '@esta/core/format';
import type { Vnd } from '@esta/core/money';
import { vndInputText } from '@esta/core/properties/form';
import { Check, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';
import { DateInput } from '@/components/date-input';
import { FieldMessage } from '@/components/field-message';
import { NoteField, TextField } from '@/components/form-parts';
import { MoneyInput } from '@/components/money/money-input';
import { FormSelect } from '@/components/properties/address-picker';
import { SheetFooter } from '@/components/sheet-footer';
import { buttonVariants } from '@/components/ui/button-variants';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useNoticeToast, useUndoToast } from '@/components/undo-toast';
import { useOnline } from '@/lib/use-online';
import { cn } from '@/lib/utils';
import { deleteExpense, restoreExpense, saveExpense, type ExpenseSaved } from '@/server/expenses/actions';
import type { ExpenseRequest, ExpenseScope } from './expense-host';
import { ReceiptField, useReceipt } from './receipt-field';

const NEW_VENDOR = 'new';
const NO_VENDOR = '';

type Errors = ExpenseProblems & { readonly category?: true; readonly vendorName?: true; readonly save?: 'networkError' | 'forbidden' | 'receiptBlocking' };

function without(errors: Errors, field: keyof Errors): Errors {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key !== field));
}

/**
 * FIN-1. Five fields and an optional receipt, so a sheet (DESIGN-BRIEF §5.3). One opening carries one expense id, so a
 * second tap or a retry after a lost answer saves one row. A failed save keeps every value Mẹ entered.
 */
export function ExpenseSheet({
  scope,
  request,
  open,
  onOpenChange,
}: {
  scope: ExpenseScope;
  request: ExpenseRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('expenses');
  const tm = useTranslations('components.money');
  const td = useTranslations('components.date');
  const locale = useLocale();
  const router = useRouter();
  const showUndo = useUndoToast();
  const showNotice = useNoticeToast();
  const fieldId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const editing = request.kind === 'edit' ? request.expense : null;
  const [expenseId] = useState(() => editing?.id ?? crypto.randomUUID());
  const [newVendorId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(() => (editing === null ? '' : vndInputText(editing.amountVnd)));
  const [category, setCategory] = useState<ExpenseCategory | null>(editing?.category ?? null);
  const [date, setDate] = useState(() => formatDate(editing?.paidOn ?? scope.today, locale));
  const [editingDate, setEditingDate] = useState(false);
  const [vendorChoice, setVendorChoice] = useState(editing?.vendor?.id ?? NO_VENDOR);
  const [vendorName, setVendorName] = useState('');
  const [note, setNote] = useState(editing?.note ?? '');
  const receipt = useReceipt({
    propertyId: scope.propertyId,
    filed: editing?.documentId ?? null,
    initialFile: request.kind === 'new' ? request.receipt : null,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const offline = !useOnline();

  const editingVendor = editing?.vendor ?? null;
  const vendors =
    editingVendor === null || scope.vendors.some((option) => option.id === editingVendor.id) ? scope.vendors : [...scope.vendors, editingVendor];
  const money = (value: Vnd) => formatVnd(value, locale);

  const vendor = (): ExpenseVendor | null => {
    if (vendorChoice === NO_VENDOR) return null;
    if (vendorChoice === NEW_VENDOR) return { kind: 'new', id: newVendorId, fullName: vendorName };
    return { kind: 'existing', id: vendorChoice };
  };

  const amountError = (): string | null => {
    const problem = errors.amount;
    if (problem === undefined) return null;
    if (problem === 'empty') return t('amountMissing');
    if (problem === 'not_positive') return t('amountNotPositive');
    return `${tm('invalid')} ${tm(`reasons.${problem}`)}`;
  };

  const dateError = (): string | null => {
    const problem = errors.paidOn;
    if (problem === undefined) return null;
    return problem === 'after_today' ? t('dateAfterToday') : `${td('invalid')} ${td(`reasons.${problem}`)}`;
  };

  const finish = (result: Extract<ExpenseSaved, { ok: true }>) => {
    onOpenChange(false);
    router.refresh();
    const amountLabel = money(result.expense.amountVnd);
    if (editing !== null) {
      showNotice(t('updated', { amount: amountLabel }));
      return;
    }
    showUndo(t('saved', { amount: amountLabel }), () => {
      deleteExpense(result.expense.id)
        .then((undone) => {
          router.refresh();
          showNotice(undone.ok ? t('undoneSave', { amount: amountLabel }) : t('undoFailed'));
        })
        .catch(() => showNotice(t('undoFailed')));
    });
  };

  const save = () => {
    const raw = { id: expenseId, propertyId: scope.propertyId, category: category ?? '', amount, paidOn: date, vendor: vendor(), receipt: null, note };
    const read = readExpense(raw, scope.today);
    const problems = read.ok ? {} : read.problems;
    const next: Errors = {
      ...(problems.amount === undefined ? {} : { amount: problems.amount }),
      ...(problems.paidOn === undefined ? {} : { paidOn: problems.paidOn }),
      ...(category === null ? { category: true } : {}),
      ...(vendorChoice === NEW_VENDOR && vendorName.trim() === '' ? { vendorName: true } : {}),
    };
    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.paidOn !== undefined) setEditingDate(true);
      return;
    }
    startTransition(async () => {
      const linked = await receipt.linked(defaultDocumentTitle(t('receiptDocument'), scope.nickname));
      if (linked === false) {
        setErrors({ save: 'receiptBlocking' });
        return;
      }
      const result = await saveExpense({ ...raw, receipt: linked }).catch(() => null);
      if (result === null) {
        setErrors({ save: 'networkError' });
        return;
      }
      if (!result.ok) {
        if (result.reason === 'forbidden') setErrors({ save: 'forbidden' });
        else if (result.reason === 'invalid' && (result.problems.amount !== undefined || result.problems.paidOn !== undefined)) setErrors(result.problems);
        else setErrors({ save: 'networkError' });
        return;
      }
      finish(result);
    });
  };

  const remove = () => {
    if (editing === null) return;
    startTransition(async () => {
      const removed = await deleteExpense(editing.id).catch(() => ({ ok: false }));
      if (!removed.ok) {
        setErrors({ save: 'networkError' });
        return;
      }
      onOpenChange(false);
      router.refresh();
      const amountLabel = money(editing.amountVnd);
      showUndo(t('deleted', { amount: amountLabel }), () => {
        restoreExpense(editing.id)
          .then((restored) => {
            router.refresh();
            showNotice(restored.ok ? t('restored', { amount: amountLabel }) : t('undoFailed'));
          })
          .catch(() => showNotice(t('undoFailed')));
      });
    });
  };

  const { preview } = receipt;
  const hasPhoto = preview !== null;

  return (
    <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <SheetContent data-testid="expense-sheet" initialFocus={title} className={cn('gap-0 p-0 pb-0', hasPhoto && 'lg:w-[54rem]')}>
        <div className={cn('flex flex-col gap-5 p-5 sm:p-6', hasPhoto && 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-start lg:gap-6')}>
          {hasPhoto ? (
            <figure className="lg:sticky lg:top-6 lg:row-span-2">
              <img
                src={preview}
                alt={t('receiptAlt')}
                data-testid="receipt-preview"
                className="max-h-56 w-full rounded-md border border-rule bg-surface-2 object-contain lg:max-h-[70dvh]"
              />
            </figure>
          ) : null}

          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-col gap-1">
              <SheetTitle ref={title} tabIndex={-1} className="outline-none">
                {editing === null ? t('titleNew') : t('titleEdit')}
              </SheetTitle>
              <SheetDescription className="font-medium break-words text-ink">{scope.nickname}</SheetDescription>
            </div>

            {offline ? (
              <p role="status" data-testid="expense-offline" className="rounded-md border border-rule bg-surface-2 px-4 py-3 text-body text-ink">
                {t('offline')}
              </p>
            ) : null}

            <MoneyInput
              label={t('amount')}
              defaultText={amount}
              onTextChange={(text) => {
                setAmount(text);
                setErrors((errors) => without(errors, 'amount'));
              }}
              disabled={pending}
              error={amountError()}
              large
            />

            <fieldset className="flex flex-col gap-2" aria-describedby={`${fieldId}-category`}>
              <legend className="mb-2 text-body font-medium text-ink">{t('category')}</legend>
              <div className="flex flex-wrap gap-2" data-testid="expense-categories">
                {EXPENSE_CATEGORY_IDS.map((id) => (
                  <label
                    key={id}
                    className="flex min-h-touch cursor-pointer items-center gap-1.5 rounded-full border border-field bg-surface px-4 text-body font-medium text-ink transition-colors duration-(--duration-fast) ease-standard hover:border-ink-muted has-checked:border-ink has-checked:bg-ink has-checked:text-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                  >
                    <input
                      type="radio"
                      name={`category-${expenseId}`}
                      value={id}
                      checked={category === id}
                      disabled={pending}
                      onChange={() => {
                        setCategory(id);
                        setErrors((errors) => without(errors, 'category'));
                      }}
                      className="peer sr-only"
                    />
                    <Check aria-hidden="true" className="hidden size-4 shrink-0 peer-checked:block" strokeWidth={2.5} />
                    {t(EXPENSE_CATEGORIES[id].labelKey)}
                  </label>
                ))}
              </div>
              <FieldMessage id={`${fieldId}-category`} error={errors.category === true ? t('categoryMissing') : null} />
            </fieldset>

            {editingDate ? (
              <div className="flex flex-col gap-1">
                <DateInput
                  label={t('date')}
                  defaultValue={editing?.paidOn ?? scope.today}
                  onTextChange={(text) => {
                    setDate(text);
                    setErrors((errors) => without(errors, 'paidOn'));
                  }}
                  disabled={pending}
                />
                {dateError() === null ? null : <FieldMessage id={`${fieldId}-date`} error={dateError()} />}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-x-3 text-body">
                <p className="text-ink">
                  <span className="font-medium">{t('date')}</span>{' '}
                  <span data-testid="expense-date" className="figures text-ink-2">
                    {(editing?.paidOn ?? scope.today) === scope.today ? t('dateToday', { date }) : date}
                  </span>
                </p>
                <button type="button" data-testid="expense-change-date" onClick={() => setEditingDate(true)} className={cn(buttonVariants({ variant: 'quiet' }), 'px-0')}>
                  {t('changeDate')}
                </button>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <FormSelect
                label={t('vendor')}
                testId="expense-vendor"
                value={vendorChoice}
                options={[
                  { value: NO_VENDOR, label: t('vendorNone') },
                  ...vendors.map((option) => ({ value: option.id, label: option.name })),
                  { value: NEW_VENDOR, label: t('vendorNew') },
                ]}
                onChange={(next) => {
                  setVendorChoice(next);
                  setErrors((errors) => without(errors, 'vendorName'));
                }}
              />
              {vendorChoice === NEW_VENDOR ? (
                <TextField
                  label={t('vendorName')}
                  testId="expense-vendor-name"
                  value={vendorName}
                  maxLength={MAX_VENDOR_NAME}
                  error={errors.vendorName === true ? t('vendorNameMissing') : null}
                  onChange={setVendorName}
                />
              ) : null}
            </div>

            <NoteField labels={{ note: t('note'), optional: t('optional') }} value={note} onChange={setNote} maxLength={MAX_EXPENSE_NOTE} disabled={pending} testId="expense-note" />

            <ReceiptField receipt={receipt} disabled={pending} onPick={() => setErrors((errors) => without(errors, 'save'))} />

            {editing === null ? null : (
              <button type="button" data-testid="expense-delete" onClick={remove} disabled={pending} className={cn(buttonVariants({ variant: 'quiet' }), 'self-start px-0 text-overdue')}>
                <Trash2 aria-hidden="true" />
                {t('delete')}
              </button>
            )}
          </div>
        </div>

        <SheetFooter
          error={errors.save === undefined ? null : t(errors.save)}
          labels={{ cancel: t('cancel'), save: t('save'), saving: t('saving') }}
          pending={pending}
          onSave={save}
          testId="expense"
        />
      </SheetContent>
    </Sheet>
  );
}
