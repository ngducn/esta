'use client';

import { useState } from 'react';
import { FormAlert } from '@/components/form-alert';
import { TextField } from '@/components/form-parts';
import { FormSheet } from '@/components/form-sheet';
import type { PopupProps } from '@/components/use-deferred-dialog';
import { voidInvoice, type InvoiceActionRefusal } from '@/server/actions/invoices';
import type { InvoiceActionLabels } from './InvoiceActions';
import { useBillAction } from './use-bill-action';

/** `Hủy hóa đơn {number}?` with the reason it needs. The bill then reads `Đã hủy` and shows no QR. */
export default function VoidInvoiceDialog({
  open,
  onOpenChange,
  finalFocus,
  invoiceId,
  labels,
}: PopupProps & { invoiceId: string; labels: InvoiceActionLabels }) {
  const [reason, setReason] = useState('');
  const { refusal, setRefusal, pending, run } = useBillAction<InvoiceActionRefusal>(() => onOpenChange(false));
  const confirm = () => (reason.trim() === '' ? setRefusal('reasonRequired') : run(() => voidInvoice({ invoice_id: invoiceId, reason })));

  return (
    <FormSheet
      surface="dialog"
      open={open}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
      testId="void-dialog"
      title={labels.voidTitle}
      titleTestId="void-question"
      description={labels.voidBody}
      labels={{ cancel: labels.keep, submit: labels.voidAction, pending: labels.voiding }}
      submitTestId="void-confirm"
      pending={pending}
      onSubmit={confirm}
      error={<FormAlert message={refusal === null || refusal === 'reasonRequired' ? null : labels.refusals[refusal]} />}
    >
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
    </FormSheet>
  );
}
