'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/dialog';

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
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="secondary" />}>{triggerLabel}</AlertDialogTrigger>
      <AlertDialogContent>
        <div className="flex flex-col gap-2">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description === undefined ? null : <AlertDialogDescription>{description}</AlertDialogDescription>}
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <AlertDialogClose render={<Button variant="secondary" />}>{t('cancel')}</AlertDialogClose>
          <AlertDialogClose render={<Button variant="primary" />} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogClose>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
