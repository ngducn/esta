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
  className = buttonVariants({ variant: 'secondary' }),
  labelClassName,
}: {
  label: string;
  title: string;
  description: string;
  invoiceHref: string | null;
  qr: InvoiceQrView;
  labels: QrSheetLabels;
  className?: string;
  labelClassName?: string | undefined;
}) {
  const dialog = useDeferredDialog(loadSheet);
  return (
    <>
      <button type="button" data-testid="row-action-qr" data-label={label} {...dialog.triggerProps} className={className}>
        <QrCode aria-hidden="true" />
        <span className={labelClassName}>{label}</span>
      </button>
      <DeferredPopup dialog={dialog} popup={QrSheet} props={{ title, description, invoiceHref, qr, labels }} />
    </>
  );
}
