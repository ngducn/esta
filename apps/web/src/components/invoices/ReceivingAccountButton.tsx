'use client';

import { Pencil, Plus } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { useDeferredDialog } from '@/components/use-deferred-dialog';
import type { AccountSheetLabels, AccountSheetMode, BankOption } from './ReceivingAccountSheet';

const loadSheet = () => import('./ReceivingAccountSheet');
const ReceivingAccountSheet = lazy(loadSheet);

/** Opens the account sheet to add or edit one. Admins only. */
export function ReceivingAccountButton({
  label,
  banks,
  labels,
  mode,
  describedBy,
}: {
  label: string;
  banks: readonly BankOption[];
  labels: AccountSheetLabels;
  mode: AccountSheetMode;
  describedBy?: string;
}) {
  const sheet = useDeferredDialog(loadSheet);
  const adding = mode.kind === 'add';
  const Icon = adding ? Plus : Pencil;
  return (
    <>
      <Button
        type="button"
        variant={adding ? 'primary' : 'outline'}
        data-testid={adding ? 'add-account' : 'edit-account'}
        aria-describedby={describedBy}
        className="self-start"
        {...sheet.triggerProps}
      >
        <Icon aria-hidden="true" />
        {label}
      </Button>
      {sheet.open === null ? null : (
        <Suspense fallback={null}>
          <ReceivingAccountSheet open={sheet.open} onOpenChange={sheet.setOpen} finalFocus={sheet.triggerProps.ref} banks={banks} labels={labels} mode={mode} />
        </Suspense>
      )}
    </>
  );
}
