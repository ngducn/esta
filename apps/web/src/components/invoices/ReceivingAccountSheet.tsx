'use client';

import { bankAccountName } from '@esta/core/vietqr';
import { useRef, useState, type RefObject } from 'react';
import { TextField } from '@/components/form-parts';
import { FormSelect } from '@/components/properties/address-picker';
import { SheetFooter } from '@/components/sheet-footer';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { addReceivingAccount, editReceivingAccount, type AccountActionRefusal } from '@/server/actions/receiving-accounts';
import { FormAlert } from '@/components/form-alert';
import { useBillAction } from './use-bill-action';

export type BankOption = { readonly value: string; readonly label: string };

export type AccountSheetLabels = {
  readonly title: string;
  readonly body: string;
  readonly addMoreBody: string;
  readonly editTitle: string;
  readonly editBody: string;
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

export type AccountFields = { readonly id: string; readonly bin: string; readonly accountNo: string; readonly accountName: string };

/** Adding says whether the new account becomes the default bills pay into; editing starts from the stored account. */
export type AccountSheetMode = { readonly kind: 'add'; readonly becomesDefault: boolean } | { readonly kind: 'edit'; readonly account: AccountFields };

/** Refusals that belong under one field; the rest show above the buttons. */
const FIELD_REFUSALS: ReadonlySet<AccountActionRefusal> = new Set(['bank', 'accountNo', 'accountName']);

function heading(mode: AccountSheetMode, labels: AccountSheetLabels) {
  if (mode.kind === 'edit') return { title: labels.editTitle, body: labels.editBody };
  return { title: labels.title, body: mode.becomesDefault ? labels.body : labels.addMoreBody };
}

/** PLT-1's receiving account, added or edited. The name folds to the uppercase ASCII banks print as Mẹ types. */
export default function ReceivingAccountSheet({
  open,
  onOpenChange,
  finalFocus,
  banks,
  labels,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
  banks: readonly BankOption[];
  labels: AccountSheetLabels;
  mode: AccountSheetMode;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const stored = mode.kind === 'edit' ? mode.account : null;
  const [id] = useState(() => stored?.id ?? crypto.randomUUID());
  const [bank, setBank] = useState(stored?.bin ?? '');
  const [accountNo, setAccountNo] = useState(stored?.accountNo ?? '');
  const [accountName, setAccountName] = useState(stored?.accountName ?? '');
  const { refusal, setRefusal, pending, run } = useBillAction<AccountActionRefusal>(() => onOpenChange(false));
  const typed = (set: (value: string) => void) => (value: string) => {
    set(value);
    setRefusal(null);
  };
  const folded = bankAccountName(accountName);
  const fieldError = (field: AccountActionRefusal) => (refusal === field ? labels.refusals[field] : null);
  const text = heading(mode, labels);

  const save = () => {
    const account = { id, bank_bin: bank, account_no: accountNo, account_name: accountName };
    run(() => (mode.kind === 'edit' ? editReceivingAccount(account) : addReceivingAccount(account)));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="account-sheet" initialFocus={title} finalFocus={finalFocus} className="gap-0 p-0 pb-0">
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <SheetTitle ref={title} tabIndex={-1} className="outline-none">
              {text.title}
            </SheetTitle>
            <SheetDescription>{text.body}</SheetDescription>
          </div>
          <div className="flex flex-col gap-1">
            <FormSelect label={labels.bank} value={bank} options={banks} placeholder={labels.bankPick} onChange={typed(setBank)} testId="account-bank" />
            <FormAlert message={fieldError('bank')} />
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
                <span data-testid="account-name-preview" className="font-medium text-ink">
                  {folded}
                </span>
              </p>
            )}
          </div>
        </div>
        <SheetFooter
          error={refusal === null || FIELD_REFUSALS.has(refusal) ? null : labels.refusals[refusal]}
          labels={{ cancel: labels.close, save: labels.save, saving: labels.saving }}
          pending={pending}
          onSave={save}
          testId="account"
        />
      </SheetContent>
    </Sheet>
  );
}
