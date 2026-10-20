import { FileText, ImageDown } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';

/**
 * LSE-6: the receipt opens as a PDF in the phone's viewer, and the picture saves to the phone for Zalo. Plain links,
 * so the route's 404 and the browser's own download handle every case without client code.
 */
export function ReceiptLinks({ invoiceId, labels }: { invoiceId: string; labels: { pdf: string; png: string } }) {
  const href = `/api/invoices/${invoiceId}/receipt`;
  return (
    <>
      <a data-testid="receipt-pdf" href={`${href}?format=pdf`} target="_blank" rel="noopener" className={buttonVariants({ variant: 'outline' })}>
        <FileText aria-hidden="true" />
        {labels.pdf}
      </a>
      <a data-testid="receipt-png" href={`${href}?format=png`} download className={buttonVariants({ variant: 'outline' })}>
        <ImageDown aria-hidden="true" />
        {labels.png}
      </a>
    </>
  );
}
