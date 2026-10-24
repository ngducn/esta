'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Same bytes are already in the household (DOC-1). It asks inside the upload sheet rather than as a second modal, so
 * the sheet's focus trap never holds the answer out of reach. `Hủy` keeps nothing; `Vẫn tải lên` goes on.
 */
export function DuplicateDialog({ title, onContinue, onCancel }: { title: string; onContinue: () => void; onCancel: () => void }) {
  const t = useTranslations('documents');
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => cancel.current?.focus(), []);
  return (
    <div
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      data-testid="duplicate-dialog"
      className="flex flex-col gap-3 rounded-md border border-due bg-due-fill p-4"
    >
      <h3 id={`${id}-title`} className="text-body font-semibold text-ink">
        {t('duplicateTitle')}
      </h3>
      <p id={`${id}-body`} className="text-body break-words text-ink-2">
        {t('duplicateBody', { title })}
      </p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button ref={cancel} type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="button" variant="primary" onClick={onContinue}>
          {t('uploadAnyway')}
        </Button>
      </div>
    </div>
  );
}
