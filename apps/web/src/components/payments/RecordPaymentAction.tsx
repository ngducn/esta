'use client';

import { Banknote } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import type { PaymentTarget } from './RecordPaymentSheet';

const loadSheet = () => import('./RecordPaymentSheet');
const RecordPaymentSheet = lazy(loadSheet);

let warming = false;

/**
 * Fetches the sheet's code on the first sign that someone is using the board (a touch, a key, a scroll), so the first
 * `Ghi nhận` opens without a wait while the board's own load carries none of it.
 */
function warmSheetOnFirstIntent() {
  if (warming) return;
  warming = true;
  const warm = () => void loadSheet();
  for (const type of ['pointerdown', 'keydown', 'scroll'] as const) window.addEventListener(type, warm, { once: true, passive: true });
}

/** `Ghi nhận` on a collections row. Each opening mounts a fresh sheet, with its own idempotency key and the row's prefill. */
export function RecordPaymentAction({ label, target }: { label: string; target: PaymentTarget }) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(0);
  useEffect(warmSheetOnFirstIntent, []);
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
