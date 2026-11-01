import type { QrMatrix } from '@/lib/qr';
import type { InvoiceQrView } from '@/server/invoices/qr';
import { QrCode } from './QrCode';
import { SaveQrImage } from './SaveQrImage';

export type QrLabels = {
  readonly code: string;
  readonly amount: string;
  readonly amountWords: string;
  readonly memo: string;
  readonly bank: string;
  readonly accountNo: string;
  readonly accountName: string;
  readonly assumption: string;
  readonly splitNote: string;
  readonly save: string;
  readonly saveFailed: string;
};

function Fact({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-border py-2.5 last:border-b-0">
      <dt className="text-body-sm text-text-muted">{label}</dt>
      <dd data-testid={testId} className="min-w-0 text-end text-body font-medium break-words text-text">
        {children}
      </dd>
    </div>
  );
}

/**
 * LSE-5: the code, then what the payer's bank app will show, in the order Mẹ reads them aloud. At or above the NAPAS
 * 247 cap the code carries no amount, so the amount stands in words and num with the note to split it.
 */
export function QrPanel({ qr, matrix, labels }: { qr: InvoiceQrView; matrix: QrMatrix; labels: QrLabels }) {
  return (
    <div data-testid="qr-panel" data-payload={qr.payload} className="flex flex-col gap-4">
      <QrCode matrix={matrix} label={labels.code} className="mx-auto max-w-80 min-w-60" />
      <dl className="flex flex-col">
        <Fact label={labels.amount} testId="qr-amount">
          <span className="num text-title-3 font-semibold">{qr.amountText}</span>
        </Fact>
        {qr.amountWords === null ? null : (
          <Fact label={labels.amountWords} testId="qr-amount-words">
            {qr.amountWords}
          </Fact>
        )}
        <Fact label={labels.memo} testId="qr-memo">
          <span className="num text-headline font-medium tracking-wide">{qr.memo}</span>
        </Fact>
        <Fact label={labels.bank} testId="qr-bank">
          {qr.bankName}
        </Fact>
        <Fact label={labels.accountNo} testId="qr-account-no">
          <span className="num">{qr.accountNo}</span>
        </Fact>
        <Fact label={labels.accountName} testId="qr-account-name">
          {qr.accountName}
        </Fact>
      </dl>
      {qr.amountWords === null ? null : (
        <p data-testid="qr-split-note" className="rounded-md border border-border bg-bg-subtle p-3 text-body text-text">
          <span className="mr-2 inline-flex rounded-full bg-warning-bg px-2.5 py-0.5 text-body-sm font-medium text-warning-text">{labels.assumption}</span>
          {labels.splitNote}
        </p>
      )}
      {qr.number === null ? null : (
        <div className="print:hidden">
          <SaveQrImage qr={qr} number={qr.number} matrix={matrix} labels={{ save: labels.save, failed: labels.saveFailed }} />
        </div>
      )}
    </div>
  );
}
