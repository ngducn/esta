'use client';

import { lazy } from 'react';
import { Button } from '@/components/ui/button';
import { DeferredPopup, useDeferredDialog } from '@/components/use-deferred-dialog';
import { issueInvoice, type InvoiceActionRefusal } from '@/server/actions/invoices';
import { FormAlert } from '@/components/form-alert';
import { useBillAction } from './use-bill-action';

const loadVoidDialog = () => import('./VoidInvoiceDialog');
const VoidInvoiceDialog = lazy(loadVoidDialog);

/** Every word the bill's actions show, translated on the server. */
export type InvoiceActionLabels = {
  readonly issue: string;
  readonly issuing: string;
  readonly voidAction: string;
  readonly voidTitle: string;
  readonly voidBody: string;
  readonly voidReason: string;
  readonly voiding: string;
  readonly keep: string;
  readonly refusals: Readonly<Record<InvoiceActionRefusal, string>>;
};

/**
 * LSE-5 on the bill: `Phát hành` issues a draft today, and `Hủy hóa đơn` voids an issued bill nobody has paid, after a
 * reason and the question naming its number. A paid bill offers no void ([app rule]).
 */
export function InvoiceActions({ invoiceId, status, labels }: { invoiceId: string; status: 'draft' | 'issued'; labels: InvoiceActionLabels }) {
  const dialog = useDeferredDialog(loadVoidDialog);
  const { refusal, pending, run } = useBillAction<InvoiceActionRefusal>();
  const issue = () => run(() => issueInvoice({ invoice_id: invoiceId }));

  return (
    <div className="flex flex-col gap-2">
      {status === 'draft' ? (
        <Button type="button" data-testid="invoice-issue" disabled={pending} onClick={issue}>
          {pending ? labels.issuing : labels.issue}
        </Button>
      ) : (
        <Button type="button" variant="outline" data-testid="invoice-void" {...dialog.triggerProps}>
          {labels.voidAction}
        </Button>
      )}
      <FormAlert message={refusal === null ? null : labels.refusals[refusal]} />
      <DeferredPopup dialog={dialog} popup={VoidInvoiceDialog} props={{ invoiceId, labels }} />
    </div>
  );
}
