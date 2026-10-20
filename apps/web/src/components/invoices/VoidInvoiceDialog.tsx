'use client';

import { useState, type RefObject } from 'react';
import { TextField } from '@/components/form-parts';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/dialog';
import { voidInvoice, type InvoiceActionRefusal } from '@/server/actions/invoices';
import { ActionRefusal } from './ActionRefusal';
import type { InvoiceActionLabels } from './InvoiceActions';
import { useBillAction } from './use-bill-action';

/** `Hủy hóa đơn {number}?` with the reason it needs. The bill then reads `Đã hủy` and shows no QR. */
export default function VoidInvoiceDialog({
  open,
  onOpenChange,
  finalFocus,
  invoiceId,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
  invoiceId: string;
  labels: InvoiceActionLabels;
}) {
  const [reason, setReason] = useState('');
  const { refusal, setRefusal, pending, run } = useBillAction<InvoiceActionRefusal>(() => onOpenChange(false));
  const confirm = () => (reason.trim() === '' ? setRefusal('reasonRequired') : run(() => voidInvoice({ invoice_id: invoiceId, reason })));

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="void-dialog" finalFocus={finalFocus} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex flex-col gap-2">
          <AlertDialogTitle data-testid="void-question">{labels.voidTitle}</AlertDialogTitle>
          <AlertDialogDescription>{labels.voidBody}</AlertDialogDescription>
        </div>
        <TextField
          label={labels.voidReason}
          value={reason}
          onChange={(text) => {
            setReason(text);
            setRefusal(null);
          }}
          error={refusal === 'reasonRequired' ? labels.refusals.reasonRequired : null}
          testId="void-reason"
          maxLength={1000}
        />
        <ActionRefusal message={refusal === null || refusal === 'reasonRequired' ? null : labels.refusals[refusal]} />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <AlertDialogClose render={<Button type="button" variant="outline" />}>{labels.keep}</AlertDialogClose>
          <Button type="button" data-testid="void-confirm" disabled={pending} onClick={confirm}>
            {pending ? labels.voiding : labels.voidAction}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
