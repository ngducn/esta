'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { PopupProps } from '@/components/use-deferred-dialog';
import { qrMatrix } from '@/lib/qr';
import type { InvoiceQrView } from '@/server/invoices/qr';
import { QrPanel, type QrLabels } from './QrPanel';

export type QrSheetLabels = QrLabels & { readonly close: string; readonly openInvoice: string };

/** Loaded on the first `Mã QR`, so `qrcode` stays out of the board's own load. */
export default function QrSheet({
  open,
  onOpenChange,
  finalFocus,
  title,
  description,
  invoiceHref,
  qr,
  labels,
}: PopupProps & {
  title: string;
  description: string;
  /** Null when the code pays no bill. */
  invoiceHref: string | null;
  qr: InvoiceQrView;
  labels: QrSheetLabels;
}) {
  const matrix = useMemo(() => qrMatrix(qr.payload), [qr.payload]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="qr-sheet" finalFocus={finalFocus} className="gap-4">
        <div className="flex flex-col gap-1">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </div>
        <QrPanel qr={qr} matrix={matrix} labels={labels} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {invoiceHref === null ? null : (
            <Link href={invoiceHref} data-testid="qr-open-invoice" className={buttonVariants({ variant: 'quiet', className: '-ml-2' })}>
              {labels.openInvoice}
            </Link>
          )}
          <SheetClose className={buttonVariants({ variant: 'secondary', className: 'ml-auto' })}>{labels.close}</SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
