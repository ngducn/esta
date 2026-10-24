'use client';

import { QrCode } from 'lucide-react';
import { lazy } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { DeferredPopup, useDeferredDialog } from '@/components/use-deferred-dialog';
import type { InvoiceQrView } from '@/server/invoices/qr';
import type { QrSheetLabels } from './QrSheet';

const loadSheet = () => import('./QrSheet');
const QrSheet = lazy(loadSheet);

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
  invoiceHref: string | null;
  qr: InvoiceQrView;
  labels: QrSheetLabels;
}) {
  const dialog = useDeferredDialog(loadSheet);
  return (
    <>
      <button type="button" data-testid="row-action-qr" {...dialog.triggerProps} className={buttonVariants({ variant: 'outline' })}>
        <QrCode aria-hidden="true" />
        {label}
      </button>
      <DeferredPopup dialog={dialog} popup={QrSheet} props={{ title, description, invoiceHref, qr, labels }} />
    </>
  );
}
