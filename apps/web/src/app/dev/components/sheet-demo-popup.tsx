'use client';

import { useTranslations } from 'next-intl';
import type { RefObject } from 'react';
import { MoneyInput } from '@/components/money/money-input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

type SheetDemoPopupProps = { open: boolean; onOpenChange: (open: boolean) => void; finalFocus: RefObject<HTMLButtonElement | null> };

export default function SheetDemoPopup({ open, onOpenChange, finalFocus }: SheetDemoPopupProps) {
  const t = useTranslations('devComponents.samples');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent finalFocus={finalFocus}>
        <div className="flex flex-col gap-1">
          <SheetTitle>{t('sheetTitle')}</SheetTitle>
          <SheetDescription>{t('sheetBody')}</SheetDescription>
        </div>
        <MoneyInput label={t('amountLabel')} defaultText="3tr5" />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <SheetClose render={<Button variant="secondary" />}>{t('close')}</SheetClose>
          <SheetClose render={<Button />}>{t('record')}</SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
