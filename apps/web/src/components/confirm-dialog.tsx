'use client';

import { useTranslations } from 'next-intl';
import { lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { useDeferredDialog } from '@/components/use-deferred-dialog';

const loadPopup = () => import('./confirm-dialog-popup');
const ConfirmDialogPopup = lazy(loadPopup);

type ConfirmDialogProps = {
  /** A question that names the object and the date, for example `Kết thúc hợp đồng Phòng 3 từ ngày 31/10/2026?` */
  title: string;
  description?: string;
  triggerLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
};

/** Only for irreversible actions; reversible ones use UndoToast instead (DESIGN-BRIEF §4). */
export function ConfirmDialog({ title, description, triggerLabel, confirmLabel, onConfirm }: ConfirmDialogProps) {
  const t = useTranslations('components.confirm');
  const dialog = useDeferredDialog(loadPopup);
  return (
    <>
      <Button variant="secondary" {...dialog.triggerProps}>
        {triggerLabel}
      </Button>
      {dialog.open === null ? null : (
        <Suspense fallback={null}>
          <ConfirmDialogPopup
            open={dialog.open}
            onOpenChange={dialog.setOpen}
            finalFocus={dialog.triggerProps.ref}
            title={title}
            confirmLabel={confirmLabel}
            cancelLabel={t('cancel')}
            onConfirm={onConfirm}
            {...(description === undefined ? {} : { description })}
          />
        </Suspense>
      )}
    </>
  );
}
