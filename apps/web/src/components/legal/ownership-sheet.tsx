'use client';

import { Pencil, Plus } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { useDeferredDialog } from '@/components/use-deferred-dialog';
import type { OwnershipSheetProps } from './ownership-sheet-popup';

const loadPopup = () => import('./ownership-sheet-popup');
const OwnershipSheetPopup = lazy(loadPopup);

/** Opens the sheet that edits every share at once; its module loads on hover, focus or the first tap. */
export function OwnershipSheet({ label, adding, ...props }: OwnershipSheetProps & { label: string; adding: boolean }) {
  const dialog = useDeferredDialog(loadPopup);
  const Icon = adding ? Plus : Pencil;
  return (
    <>
      <Button variant={adding ? 'primary' : 'outline'} data-testid="edit-owners" {...dialog.triggerProps}>
        <Icon aria-hidden="true" />
        {label}
      </Button>
      {dialog.open === null ? null : (
        <Suspense fallback={null}>
          <OwnershipSheetPopup open={dialog.open} onOpenChange={dialog.setOpen} finalFocus={dialog.triggerProps.ref} {...props} />
        </Suspense>
      )}
    </>
  );
}
