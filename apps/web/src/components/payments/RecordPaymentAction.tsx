'use client';

import { Banknote } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import type { PaymentTarget } from './RecordPaymentSheet';

const loadSheet = () => import('./RecordPaymentSheet');
const RecordPaymentSheet = lazy(loadSheet);

/**
 * `Ghi nhận` on a collections row. The sheet's code loads once the board is interactive, so the first tap opens it
 * without a wait. Each opening mounts a fresh sheet, which gives it its own idempotency key and the row's prefill.
 */
export function RecordPaymentAction({ label, target }: { label: string; target: PaymentTarget }) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(0);
  useEffect(() => {
    void loadSheet();
  }, []);
  return (
    <>
      <button
        type="button"
        data-testid="row-action-record-payment"
        aria-haspopup="dialog"
        onClick={() => {
          setOpening((count) => count + 1);
          setOpen(true);
        }}
        className={buttonVariants({ variant: 'outline' })}
      >
        <Banknote aria-hidden="true" />
        {label}
      </button>
      {opening === 0 ? null : (
        <Suspense fallback={null}>
          <RecordPaymentSheet key={opening} open={open} onOpenChange={setOpen} target={target} />
        </Suspense>
      )}
    </>
  );
}
