'use client';

import { Pencil, Plus } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { useDeferredDialog } from '@/components/use-deferred-dialog';
import type { OwnershipSheetProps } from './ownership-sheet-popup';

const loadPopup = () => import('./ownership-sheet-popup');
const OwnershipSheetPopup = lazy(loadPopup);

export function OwnershipSheet({ label, adding, ...props }: OwnershipSheetProps & { label: string; adding: boolean }) {
  const dialog = useDeferredDialog(loadPopup);
  const Icon = adding ? Plus : Pencil;
  return (
    <>
      <button type="button" className={buttonVariants({ variant: adding ? 'primary' : 'outline' })} data-testid="edit-owners" {...dialog.triggerProps}>
        <Icon aria-hidden="true" />
        {label}
      </button>
      {dialog.open === null ? null : (
        <Suspense fallback={null}>
          <OwnershipSheetPopup open={dialog.open} onOpenChange={dialog.setOpen} finalFocus={dialog.triggerProps.ref} {...props} />
        </Suspense>
      )}
    </>
  );
}
