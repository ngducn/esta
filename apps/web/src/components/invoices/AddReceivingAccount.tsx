'use client';

import { lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { useDeferredDialog } from '@/components/use-deferred-dialog';
import type { AccountSheetLabels, BankOption } from './ReceivingAccountSheet';

const loadSheet = () => import('./ReceivingAccountSheet');
const ReceivingAccountSheet = lazy(loadSheet);

/** On a bill that cannot show a QR for want of an account; only an admin sees it. */
export function AddReceivingAccount({ label, banks, labels }: { label: string; banks: readonly BankOption[]; labels: AccountSheetLabels }) {
  const sheet = useDeferredDialog(loadSheet);
  return (
    <>
      <Button type="button" data-testid="add-account" className="self-start" {...sheet.triggerProps}>
        {label}
      </Button>
      {sheet.open === null ? null : (
        <Suspense fallback={null}>
          <ReceivingAccountSheet open={sheet.open} onOpenChange={sheet.setOpen} finalFocus={sheet.triggerProps.ref} banks={banks} labels={labels} />
        </Suspense>
      )}
    </>
  );
}
