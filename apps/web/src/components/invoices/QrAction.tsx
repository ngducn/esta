'use client';

import { QrCode } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { useDeferredDialog } from '@/components/use-deferred-dialog';
import type { InvoiceQrView } from '@/server/invoices/qr';
import type { QrSheetLabels } from './QrSheet';

const loadSheet = () => import('./QrSheet');
const QrSheet = lazy(loadSheet);

/** `Mã QR` on a board row: opens the code for what the row still owes. */
export function QrAction({
  label,
  title,
  description,
  invoiceHref,
  qr,
  labels,
}: {
  label: string;
  title: string;
  description: string;
  invoiceHref: string;
  qr: InvoiceQrView;
  labels: QrSheetLabels;
}) {
  const { open, setOpen, triggerProps } = useDeferredDialog(loadSheet);
  return (
    <>
      <button type="button" data-testid="row-action-qr" {...triggerProps} className={buttonVariants({ variant: 'outline' })}>
        <QrCode aria-hidden="true" />
        {label}
      </button>
      {open === null ? null : (
        <Suspense fallback={null}>
          <QrSheet open={open} onOpenChange={setOpen} title={title} description={description} invoiceHref={invoiceHref} qr={qr} labels={labels} />
        </Suspense>
      )}
    </>
  );
}
