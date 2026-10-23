import { ScanText } from 'lucide-react';

/** `Từ hợp đồng đã quét` under a lease field the scanned contract filled (P3-19). */
export function FromContractMark({ label }: { label: string }) {
  return (
    <p data-testid="from-contract" className="flex items-center gap-1.5 text-small text-ink-muted">
      <ScanText className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
      {label}
    </p>
  );
}
