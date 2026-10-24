'use client';

import { BadgeCheck, Trash2 } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { ActionRefusal } from '@/components/invoices/ActionRefusal';
import { useBillAction } from '@/components/invoices/use-bill-action';
import { Button } from '@/components/ui/button';
import { useDeferredDialog } from '@/components/use-deferred-dialog';
import { removeReceivingAccount, setDefaultReceivingAccount, type AccountActionRefusal } from '@/server/actions/receiving-accounts';

const loadConfirm = () => import('@/components/confirm-dialog-popup');
const ConfirmDialogPopup = lazy(loadConfirm);

export type AccountActionLabels = {
  readonly makeDefault: string;
  readonly remove: string;
  readonly removeBody: string;
  readonly removeConfirm: string;
  readonly keep: string;
  readonly refusals: Readonly<Record<AccountActionRefusal, string>>;
};

/** `Đặt làm mặc định` and `Xóa` on an account that is not the default; the default is neither moved from nor removed here. */
export function AccountActions({ id, removeTitle, describedBy, labels }: { id: string; removeTitle: string; describedBy: string; labels: AccountActionLabels }) {
  const { refusal, pending, run } = useBillAction<AccountActionRefusal>();
  const confirm = useDeferredDialog(loadConfirm);
  return (
    <>
      <Button type="button" variant="outline" data-testid="make-default" aria-describedby={describedBy} disabled={pending} onClick={() => run(() => setDefaultReceivingAccount({ id }))}>
        <BadgeCheck aria-hidden="true" />
        {labels.makeDefault}
      </Button>
      <Button type="button" variant="outline" data-testid="remove-account" aria-describedby={describedBy} disabled={pending} {...confirm.triggerProps}>
        <Trash2 aria-hidden="true" />
        {labels.remove}
      </Button>
      {confirm.open === null ? null : (
        <Suspense fallback={null}>
          <ConfirmDialogPopup
            open={confirm.open}
            onOpenChange={confirm.setOpen}
            finalFocus={confirm.triggerProps.ref}
            title={removeTitle}
            description={labels.removeBody}
            confirmLabel={labels.removeConfirm}
            cancelLabel={labels.keep}
            onConfirm={() => run(() => removeReceivingAccount({ id }))}
          />
        </Suspense>
      )}
      <div className="basis-full empty:hidden">
        <ActionRefusal message={refusal === null ? null : labels.refusals[refusal]} />
      </div>
    </>
  );
}
