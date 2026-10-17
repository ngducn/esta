'use client';

import { parseVndInput } from '@esta/core/parse/vnd-input';
import { nextRoomLabels } from '@esta/core/properties';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { addRooms } from '@/app/(app)/properties/[id]/rental/actions';
import { TextField } from '@/components/form-parts';
import { MoneyInput } from '@/components/money/money-input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { RentalFormError, type RentalFormErrorKind } from './rental-form-error';

const MAX_ROOMS = 50;

function readCount(text: string): number | null {
  const trimmed = text.trim();
  const count = /^[0-9]{1,2}$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  return count >= 1 && count <= MAX_ROOMS ? count : null;
}

/**
 * `existing` is the labels when the sheet opened, so the labels sent are fixed for its life: a second tap on save
 * sends the same labels, and the server skips any that already exist.
 */
export default function AddRoomsSheet({ propertyId, existing, onClose }: { propertyId: string; existing: readonly string[]; onClose: () => void }) {
  const t = useTranslations('propertyRental');
  const router = useRouter();
  const [countText, setCountText] = useState('1');
  const [rentText, setRentText] = useState('');
  const [invalid, setInvalid] = useState<'count' | null>(null);
  const [error, setError] = useState<RentalFormErrorKind>(null);
  const [pending, startTransition] = useTransition();
  const count = readCount(countText);
  const labels = nextRoomLabels(existing, count ?? 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const rent = rentText.trim() === '' ? { ok: true as const, value: null } : parseVndInput(rentText);
    setInvalid(count === null ? 'count' : null);
    if (count === null || !rent.ok) {
      setError('invalid');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addRooms(propertyId, { labels, list_rent_vnd: rent.value }).catch(() => ({ ok: false, reason: 'failed' }) as const);
      if (result.ok) {
        router.refresh();
        onClose();
        return;
      }
      setError(result.reason === 'failed' ? 'network' : result.reason);
    });
  };

  return (
    <Sheet open onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent data-testid="add-rooms-sheet">
        <div className="flex flex-col gap-1">
          <SheetTitle>{t('addRoomsTitle')}</SheetTitle>
          <SheetDescription>{t('addRoomsBody')}</SheetDescription>
        </div>
        <form noValidate onSubmit={submit} className="flex flex-col gap-5">
          <TextField
            label={t('roomCountField')}
            inputId="room-count"
            value={countText}
            maxLength={2}
            inputMode="numeric"
            className="figures max-w-32"
            error={invalid === 'count' ? t('roomCountInvalid') : null}
            onChange={setCountText}
          />
          <MoneyInput label={t('roomRentField')} onTextChange={setRentText} />
          {labels.length === 0 ? null : (
            <p data-testid="room-labels" className="text-body text-ink-2">
              {t('addRoomsPreview', { labels: labels.join(', ') })}
            </p>
          )}
          <RentalFormError error={error} />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <SheetClose render={<Button type="button" variant="outline" />}>{t('cancel')}</SheetClose>
            <Button type="submit" disabled={pending} data-testid="save-rooms">
              {pending ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
