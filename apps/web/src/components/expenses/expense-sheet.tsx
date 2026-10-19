'use client';

import { defaultDocumentTitle } from '@esta/core/documents';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_IDS,
  expenseInputSchema,
  expenseProblems,
  MAX_EXPENSE_NOTE,
  MAX_VENDOR_NAME,
  type ExpenseCategory,
  type ExpenseProblems,
  type ExpenseVendor,
} from '@esta/core/expenses';
import { formatDate, formatVnd } from '@esta/core/format';
import type { Vnd } from '@esta/core/money';
import { Camera, Check, FileText, FolderOpen, RotateCw, Trash2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { DateInput } from '@/components/date-input';
import { FieldMessage } from '@/components/field-message';
import { TextField } from '@/components/form-parts';
import { MoneyInput } from '@/components/money/money-input';
import { FormSelect } from '@/components/properties/address-picker';
import { StatusShape } from '@/components/status-mark';
import { buttonVariants } from '@/components/ui/button-variants';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useNoticeToast, useUndoToast } from '@/components/undo-toast';
import { ACCEPT, checkFile, prepareFile, sendPrepared, type Prepared } from '@/lib/upload/prepare';
import { useObjectUrl } from '@/lib/use-object-url';
import { cn } from '@/lib/utils';
import { createDocumentUpload, registerDocument } from '@/server/documents/actions';
import { createExpense, deleteExpense, restoreExpense, updateExpense, type ExpenseSaved } from '@/server/expenses/actions';
import type { ExpenseRequest, ExpenseScope } from './expense-host';

/**
 * The receipt photo as one state: each step names what the sheet shows beside the fields. The upload starts the moment
 * a photo is chosen, so Mẹ types the amount while it travels; `Lưu` waits for it.
 */
type Receipt =
  | { readonly step: 'none' }
  | { readonly step: 'saved'; readonly documentId: string }
  | { readonly step: 'preparing'; readonly file: File }
  | { readonly step: 'uploading'; readonly file: File; readonly prepared: Prepared; readonly loaded: number; readonly total: number }
  | { readonly step: 'uploaded'; readonly file: File; readonly prepared: Prepared; readonly documentId: string }
  | { readonly step: 'failed'; readonly file: File; readonly problem: 'tooLarge' | 'wrongType' | 'unreadable' | 'receiptFailed' };

const NEW_VENDOR = 'new';
const NO_VENDOR = '';

type Errors = ExpenseProblems & { readonly category?: true; readonly vendorName?: true; readonly save?: 'networkError' | 'forbidden' | 'receiptBlocking' };

function without(errors: Errors, field: keyof Errors): Errors {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key !== field));
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** The saved amount as Mẹ would type it again, which `parseVndInput` reads back in either language. */
function amountText(amount: Vnd): string {
  return formatVnd(amount, 'vi').replace(/\s*₫$/, '');
}

type FileProblem = Extract<Receipt, { step: 'failed' }>['problem'];

function fileProblem(file: File): FileProblem | null {
  const problem = checkFile(file);
  return problem === 'fileRequired' ? null : problem;
}

function previewOf(receipt: Receipt): Blob | null {
  if (receipt.step === 'uploading' || receipt.step === 'uploaded') return receipt.prepared.previews.review;
  if ((receipt.step === 'preparing' || receipt.step === 'failed') && receipt.file.type.startsWith('image/')) return receipt.file;
  return null;
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
  const [amount, setAmount] = useState(() => (editing === null ? '' : amountText(editing.amountVnd)));
  const [category, setCategory] = useState<ExpenseCategory | null>(editing?.category ?? null);
  const [date, setDate] = useState(() => formatDate(editing?.paidOn ?? scope.today, locale));
  const [editingDate, setEditingDate] = useState(false);
  const [vendorChoice, setVendorChoice] = useState(editing?.vendor?.id ?? NO_VENDOR);
  const [vendorName, setVendorName] = useState('');
  const [note, setNote] = useState(editing?.note ?? '');
  const [initialReceipt] = useState(() => (request.kind === 'new' ? request.receipt : null));
  const [receipt, setReceipt] = useState<Receipt>(() => {
    if (initialReceipt !== null) {
      const problem = fileProblem(initialReceipt);
      return problem === null ? { step: 'preparing', file: initialReceipt } : { step: 'failed', file: initialReceipt, problem };
    }
    return editing === null || editing.documentId === null ? { step: 'none' } : { step: 'saved', documentId: editing.documentId };
  });
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const offline = useSyncExternalStore(subscribeOnline, () => !navigator.onLine, () => false);
  const generation = useRef(0);
  const upload = useRef<Promise<string | null> | null>(null);
  const preview = useObjectUrl(previewOf(receipt));

  const current = editing?.vendor ?? null;
  const vendors = current === null || scope.vendors.some((option) => option.id === current.id) ? scope.vendors : [...scope.vendors, current];
  const money = (value: Vnd) => formatVnd(value, locale);

  /** Runs from the `preparing` step the caller set, so nothing here sets state before its first wait. */
  const sendReceipt = async (file: File, run: number): Promise<string | null> => {
    const current = () => generation.current === run;
    const fail = (problem: FileProblem) => {
      if (current()) setReceipt({ step: 'failed', file, problem });
      return null;
    };
    const prepared = await prepareFile(file);
    if (prepared === null) return fail('unreadable');
    if (!current()) return null;
    const meta = { propertyId: scope.propertyId, category: 'invoice_receipt', filename: file.name, mime: file.type, size: file.size, sha256: prepared.sha256 };
    try {
      const ticket = await createDocumentUpload(meta);
      if (!ticket.ok) return fail('receiptFailed');
      if (current()) setReceipt({ step: 'uploading', file, prepared, loaded: 0, total: file.size });
      await sendPrepared(ticket, prepared, ({ loaded, total }) => {
        if (current()) setReceipt({ step: 'uploading', file, prepared, loaded, total });
      });
      const registered = await registerDocument({
        ...meta,
        documentId: ticket.documentId,
        title: defaultDocumentTitle(t('receiptDocument'), scope.nickname),
        expiresOn: null,
        pageCount: prepared.previews.pageCount,
      });
      if (!registered.ok) return fail('receiptFailed');
      if (current()) setReceipt({ step: 'uploaded', file, prepared, documentId: ticket.documentId });
      return current() ? ticket.documentId : null;
    } catch {
      return fail('receiptFailed');
    }
  };

  const chooseReceipt = (file: File | undefined) => {
    if (file === undefined) return;
    const run = ++generation.current;
    setErrors((errors) => without(errors, 'save'));
    const problem = fileProblem(file);
    if (problem !== null) {
      upload.current = null;
      setReceipt({ step: 'failed', file, problem });
      return;
    }
    setReceipt({ step: 'preparing', file });
    upload.current = sendReceipt(file, run);
  };

  // A Strict Mode rerun starts a second send; the first stops after preparing, since its run is no longer current.
  const startInitialReceipt = useEffectEvent(() => {
    if (initialReceipt !== null && receipt.step === 'preparing') upload.current = sendReceipt(initialReceipt, ++generation.current);
  });
  useEffect(() => startInitialReceipt(), []);

  const dropReceipt = () => {
    generation.current++;
    upload.current = null;
    setReceipt({ step: 'none' });
  };

  const vendor = (): ExpenseVendor | null => {
    if (vendorChoice === NO_VENDOR) return null;
    if (vendorChoice === NEW_VENDOR) return { kind: 'new', id: newVendorId, fullName: vendorName };
    return { kind: 'existing', id: vendorChoice };
  };

  const documentId = async (): Promise<string | null | false> => {
    if (receipt.step === 'none') return null;
    if (receipt.step === 'saved' || receipt.step === 'uploaded') return receipt.documentId;
    if (receipt.step === 'failed' || upload.current === null) return false;
    return (await upload.current) ?? false;
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
    const raw = { id: expenseId, propertyId: scope.propertyId, category: category ?? '', amount, paidOn: date, vendor: vendor(), documentId: null, note };
    const parsed = expenseInputSchema(scope.today).safeParse(raw);
    const problems = parsed.success ? {} : expenseProblems(parsed.error);
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
      const linked = await documentId();
      if (linked === false) {
        setErrors({ save: 'receiptBlocking' });
        return;
      }
      const action = editing === null ? createExpense : updateExpense;
      const result = await action({ ...raw, documentId: linked }).catch(() => null);
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

  const busy = pending;
  const hasPhoto = preview !== null;
  const percent = receipt.step === 'uploading' && receipt.total > 0 ? Math.round((receipt.loaded / receipt.total) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <SheetContent data-testid="expense-sheet" initialFocus={title} className={cn('gap-0 p-0 pb-0', hasPhoto && 'lg:w-[54rem]')}>
        <div className={cn('flex flex-col gap-5 p-5 sm:p-6', hasPhoto && 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-start lg:gap-6')}>
          {hasPhoto ? (
            <figure className="lg:sticky lg:top-6 lg:row-span-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL of the receipt chosen in this tab */}
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
              <SheetDescription className="font-semibold break-words text-ink">{scope.nickname}</SheetDescription>
            </div>

            {offline ? (
              <p role="status" data-testid="expense-offline" className="rounded-md border border-rule bg-surface-2 px-4 py-3 text-body text-ink">
                {t('offline')}
              </p>
            ) : null}

            <MoneyInput label={t('amount')} defaultText={amount} onTextChange={setAmount} disabled={busy} error={amountError()} large />

            <fieldset className="flex flex-col gap-2" aria-describedby={`${fieldId}-category`}>
              <legend className="mb-2 text-body font-semibold text-ink">{t('category')}</legend>
              <div className="flex flex-wrap gap-2" data-testid="expense-categories">
                {EXPENSE_CATEGORY_IDS.map((id) => (
                  <label
                    key={id}
                    className="flex min-h-touch cursor-pointer items-center gap-1.5 rounded-full border border-field bg-surface px-4 text-body font-semibold text-ink transition-colors duration-(--duration-fast) ease-standard hover:border-ink-muted has-checked:border-ink has-checked:bg-ink has-checked:text-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                  >
                    <input
                      type="radio"
                      name={`category-${expenseId}`}
                      value={id}
                      checked={category === id}
                      disabled={busy}
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
                <DateInput label={t('date')} defaultValue={editing?.paidOn ?? scope.today} onTextChange={setDate} disabled={busy} />
                {dateError() === null ? null : <FieldMessage id={`${fieldId}-date`} error={dateError()} />}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-x-3 text-body">
                <p className="text-ink">
                  <span className="font-semibold">{t('date')}</span>{' '}
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

            <div className="flex flex-col gap-1">
              <label htmlFor={`${fieldId}-note`} className="text-body font-semibold text-ink">
                {t('note')} <span className="font-normal text-ink-muted">({t('optional')})</span>
              </label>
              <textarea
                id={`${fieldId}-note`}
                data-testid="expense-note"
                value={note}
                rows={2}
                maxLength={MAX_EXPENSE_NOTE}
                disabled={busy}
                onChange={(event) => setNote(event.target.value)}
                className="mt-1 min-h-touch w-full rounded-md border border-field bg-surface px-3.5 py-2.5 text-body text-ink hover:border-ink-muted disabled:cursor-not-allowed disabled:border-rule disabled:bg-surface-2 disabled:text-ink-muted"
              />
            </div>

            <section aria-labelledby={`${fieldId}-receipt`} className="flex flex-col gap-3" data-testid="expense-receipt">
              <h3 id={`${fieldId}-receipt`} className="text-body font-semibold text-ink">
                {t('receiptTitle')} <span className="font-normal text-ink-muted">({t('optional')})</span>
              </h3>
              {receipt.step === 'saved' ? (
                <Link href={`/documents/${receipt.documentId}`} data-testid="expense-saved-receipt" className={cn(buttonVariants({ variant: 'quiet' }), 'self-start px-0')}>
                  <FileText aria-hidden="true" />
                  {t('receiptSaved')}
                </Link>
              ) : null}
              {receipt.step === 'preparing' ? <p className="text-small text-ink-muted">{t('receiptPreparing')}</p> : null}
              {receipt.step === 'uploading' ? (
                <div className="flex flex-col gap-1" data-testid="receipt-uploading">
                  <p className="text-small text-ink-2">{t('receiptUploading')}</p>
                  <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t('receiptUploading')} className="h-1.5 overflow-hidden rounded-full bg-rule">
                    <div className="h-full rounded-full bg-ink transition-[width] duration-(--duration-fast) ease-standard" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              ) : null}
              {receipt.step === 'uploaded' ? (
                <p data-testid="receipt-uploaded" className="flex items-center gap-2 text-small text-ink-2">
                  <StatusShape status="paid" className="size-4" />
                  {t('receiptUploaded')}
                </p>
              ) : null}
              {receipt.step === 'failed' ? (
                <div className="flex flex-col items-start gap-2">
                  <FieldMessage id={`${fieldId}-receipt-error`} error={t(receipt.problem)} />
                  {receipt.problem === 'receiptFailed' ? (
                    <button type="button" data-testid="receipt-retry" onClick={() => chooseReceipt(receipt.file)} className={buttonVariants({ variant: 'outline' })}>
                      <RotateCw aria-hidden="true" />
                      {t('receiptRetry')}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-2 min-[22rem]:grid-cols-2">
                <label className="relative inline-flex min-h-touch cursor-pointer items-center justify-center gap-2 rounded-sm border border-rule-strong bg-surface px-4 text-body font-semibold text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
                  <Camera className="size-5" aria-hidden="true" />
                  {t('takePhoto')}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    data-testid="sheet-receipt-camera"
                    disabled={busy}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(event) => {
                      chooseReceipt(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </label>
                <label className="relative inline-flex min-h-touch cursor-pointer items-center justify-center gap-2 rounded-sm border border-rule-strong bg-surface px-4 text-body font-semibold text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
                  <FolderOpen className="size-5" aria-hidden="true" />
                  {t('chooseFile')}
                  <input
                    type="file"
                    accept={ACCEPT}
                    data-testid="sheet-receipt-file"
                    disabled={busy}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(event) => {
                      chooseReceipt(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
              {receipt.step === 'none' ? null : (
                <button type="button" data-testid="receipt-remove" onClick={dropReceipt} disabled={busy} className={cn(buttonVariants({ variant: 'quiet' }), 'self-start px-0')}>
                  <X aria-hidden="true" />
                  {t('receiptRemove')}
                </button>
              )}
            </section>

            {editing === null ? null : (
              <button type="button" data-testid="expense-delete" onClick={remove} disabled={busy} className={cn(buttonVariants({ variant: 'quiet' }), 'self-start px-0 text-overdue')}>
                <Trash2 aria-hidden="true" />
                {t('delete')}
              </button>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 mt-auto flex flex-col gap-3 border-t border-rule bg-surface px-5 pt-4 pb-[max(--spacing(5),env(safe-area-inset-bottom))] sm:px-6">
          {errors.save === undefined ? null : (
            <p role="alert" data-testid="expense-error" className="flex items-start gap-2 text-body text-overdue">
              <StatusShape status="overdue" className="mt-1 size-4" />
              <span className="min-w-0 wrap-anywhere">{t(errors.save)}</span>
            </p>
          )}
          <div className="flex gap-2">
            <SheetClose disabled={busy} className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>
              {t('cancel')}
            </SheetClose>
            <button type="button" data-testid="expense-save" onClick={save} disabled={busy} className={cn(buttonVariants({ variant: 'primary' }), 'flex-[2]')}>
              {busy ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
