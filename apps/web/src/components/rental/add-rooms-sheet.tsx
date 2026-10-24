'use client';

import { parseVndInput } from '@esta/core/parse/vnd-input';
import { nextRoomLabels } from '@esta/core/properties';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addRooms } from '@/app/(app)/properties/[id]/rental/actions';
import { TextField } from '@/components/form-parts';
import { MoneyInput } from '@/components/money/money-input';
import { FormSheet } from '@/components/form-sheet';
import { useAction } from '@/components/use-action';
import type { PopupProps } from '@/components/use-deferred-dialog';
import { RentalFormError, type RentalFormErrorKind } from './rental-form-error';

const MAX_ROOMS = 50;

function readCount(text: string): number | null {
  const trimmed = text.trim();
  const count = /^[0-9]{1,2}$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  return count >= 1 && count <= MAX_ROOMS ? count : null;
}

/**
 * The labels are worked out from the rooms there were when the sheet opened, so they are fixed for its life: a second tap
 * on save sends the same labels, and the server skips any that already exist.
 */
export default function AddRoomsSheet({ propertyId, existing: current, open, onOpenChange, finalFocus }: PopupProps & { propertyId: string; existing: readonly string[] }) {
  const t = useTranslations('propertyRental');
  const router = useRouter();
  const [existing] = useState(current);
  const [countText, setCountText] = useState('1');
  const [rentText, setRentText] = useState('');
  const [invalid, setInvalid] = useState<'count' | null>(null);
  const [error, setError] = useState<RentalFormErrorKind>(null);
  const { pending, run } = useAction();
  const count = readCount(countText);
  const labels = nextRoomLabels(existing, count ?? 0);

  const submit = () => {
    const rent = rentText.trim() === '' ? { ok: true as const, value: null } : parseVndInput(rentText);
    setInvalid(count === null ? 'count' : null);
    if (count === null || !rent.ok) {
      setError('invalid');
      return;
    }
    setError(null);
    run(
      () => addRooms(propertyId, { labels, list_rent_vnd: rent.value }),
      (result) => {
        if (result.ok) {
          router.refresh();
          onOpenChange(false);
          return;
        }
        setError(result.reason === 'failed' ? 'network' : result.reason);
      },
    );
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
      testId="add-rooms-sheet"
      title={t('addRoomsTitle')}
      description={t('addRoomsBody')}
      labels={{ cancel: t('cancel'), submit: t('save'), pending: t('saving') }}
      submitTestId="save-rooms"
      pending={pending}
      onSubmit={submit}
      error={<RentalFormError error={error} />}
    >
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
    </FormSheet>
  );
}
