'use client';

import { useTranslations } from 'next-intl';
import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { OwnershipForm, type OwnershipFormProps } from './ownership-form';

export type OwnershipSheetProps = OwnershipFormProps;

export default function OwnershipSheetPopup({
  open,
  onOpenChange,
  finalFocus,
  ...props
}: OwnershipSheetProps & { open: boolean; onOpenChange: (open: boolean) => void; finalFocus: RefObject<HTMLButtonElement | null> }) {
  const t = useTranslations('propertyOwners');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent finalFocus={finalFocus} data-testid="ownership-sheet">
        <div className="flex flex-col gap-1">
          <SheetTitle>{t('sheetTitle')}</SheetTitle>
          <SheetDescription>{t('sheetBody')}</SheetDescription>
        </div>
        <OwnershipForm
          {...props}
          inSheet
          onSaved={() => onOpenChange(false)}
          cancel={<SheetClose render={<Button type="button" variant="outline" />}>{t('cancel')}</SheetClose>}
        />
      </SheetContent>
    </Sheet>
  );
}
