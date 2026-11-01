'use client';

import { Printer } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" data-testid="invoice-print" onClick={() => window.print()} className={buttonVariants({ variant: 'secondary' })}>
      <Printer aria-hidden="true" />
      {label}
    </button>
  );
}
