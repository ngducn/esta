'use client';

import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/dialog';

type ConfirmDialogPopupProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
};

export default function ConfirmDialogPopup({ open, onOpenChange, finalFocus, title, description, confirmLabel, cancelLabel, onConfirm }: ConfirmDialogPopupProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent finalFocus={finalFocus}>
        <div className="flex flex-col gap-2">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description === undefined ? null : <AlertDialogDescription>{description}</AlertDialogDescription>}
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <AlertDialogClose render={<Button variant="secondary" />}>{cancelLabel}</AlertDialogClose>
          <AlertDialogClose render={<Button variant="primary" />} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogClose>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
