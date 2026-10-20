'use client';

import { bankAccountName } from '@esta/core/vietqr';
import { useRef, useState, type RefObject } from 'react';
import { TextField } from '@/components/form-parts';
import { FormSelect } from '@/components/properties/address-picker';
import { buttonVariants } from '@/components/ui/button-variants';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { addReceivingAccount, type AccountActionRefusal } from '@/server/actions/invoices';
import { ActionRefusal } from './ActionRefusal';
import { useBillAction } from './use-bill-action';

export type BankOption = { readonly value: string; readonly label: string };

export type AccountSheetLabels = {
  readonly title: string;
  readonly body: string;
  readonly bank: string;
  readonly bankPick: string;
  readonly accountNo: string;
  readonly accountName: string;
  readonly accountNameHint: string;
  readonly accountNamePreview: string;
  readonly save: string;
  readonly saving: string;
  readonly close: string;
  readonly refusals: Readonly<Record<AccountActionRefusal, string>>;
};

/** Refusals that belong under one field; the rest show above the buttons. */
const FIELD_REFUSALS: ReadonlySet<AccountActionRefusal> = new Set(['bank', 'accountNo', 'accountName']);

/**
 * PLT-1's receiving account, offered on a bill when the household has none, so its QR can be made. The name folds to
 * the uppercase ASCII banks print as Mẹ types. Settings manages accounts later (P6-01).
 */
export default function ReceivingAccountSheet({
  open,
  onOpenChange,
  finalFocus,
  banks,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
  banks: readonly BankOption[];
  labels: AccountSheetLabels;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const [id] = useState(() => crypto.randomUUID());
  const [bank, setBank] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [accountName, setAccountName] = useState('');
  const { refusal, setRefusal, pending, run } = useBillAction<AccountActionRefusal>(() => onOpenChange(false));
  const typed = (set: (value: string) => void) => (value: string) => {
    set(value);
    setRefusal(null);
  };
  const folded = bankAccountName(accountName);
  const fieldError = (field: AccountActionRefusal) => (refusal === field ? labels.refusals[field] : null);

  const save = () => run(() => addReceivingAccount({ id, bank_bin: bank, account_no: accountNo, account_name: accountName }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="account-sheet" initialFocus={title} finalFocus={finalFocus} className="gap-0 p-0 pb-0">
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <SheetTitle ref={title} tabIndex={-1} className="outline-none">
              {labels.title}
            </SheetTitle>
            <SheetDescription>{labels.body}</SheetDescription>
          </div>
          <div className="flex flex-col gap-1">
            <FormSelect label={labels.bank} value={bank} options={banks} placeholder={labels.bankPick} onChange={typed(setBank)} testId="account-bank" />
            <ActionRefusal message={fieldError('bank')} />
          </div>
          <TextField label={labels.accountNo} value={accountNo} onChange={typed(setAccountNo)} error={fieldError('accountNo')} testId="account-no" inputMode="numeric" maxLength={30} />
          <div className="flex flex-col gap-1">
            <TextField
              label={labels.accountName}
              hint={labels.accountNameHint}
              value={accountName}
              onChange={typed(setAccountName)}
              error={fieldError('accountName')}
              testId="account-name"
              maxLength={60}
            />
            {folded === null || refusal === 'accountName' ? null : (
              <p className="flex flex-col text-small text-ink-2">
                <span>{labels.accountNamePreview}</span>
                <span data-testid="account-name-preview" className="font-semibold text-ink">
                  {folded}
                </span>
              </p>
            )}
          </div>
        </div>
        <div className="sticky bottom-0 mt-auto flex flex-col gap-3 border-t border-rule bg-surface px-5 pt-4 pb-[max(--spacing(5),env(safe-area-inset-bottom))] sm:px-6">
          <ActionRefusal message={refusal === null || FIELD_REFUSALS.has(refusal) ? null : labels.refusals[refusal]} />
          <div className="flex gap-2">
            <SheetClose className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>{labels.close}</SheetClose>
            <button type="button" data-testid="account-save" onClick={save} disabled={pending} className={cn(buttonVariants({ variant: 'primary' }), 'flex-[2]')}>
              {pending ? labels.saving : labels.save}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
