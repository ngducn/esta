'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/dialog';

/** Same bytes are already in the household (DOC-1). `Hủy` keeps nothing; `Vẫn tải lên` goes on with the upload. */
export function DuplicateDialog({ title, onContinue, onCancel }: { title: string; onContinue: () => void; onCancel: () => void }) {
  const t = useTranslations('documents');
  return (
    <AlertDialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <AlertDialogContent data-testid="duplicate-dialog">
        <div className="flex flex-col gap-2">
          <AlertDialogTitle>{t('duplicateTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('duplicateBody', { title })}</AlertDialogDescription>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <AlertDialogClose render={<Button variant="outline" />}>{t('cancel')}</AlertDialogClose>
          <Button variant="primary" onClick={onContinue}>
            {t('uploadAnyway')}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
