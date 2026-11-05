'use client';

import type { PropertyKind, UseMode } from '@esta/core/properties/form';
import { FileSignature } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { FormAlert } from '@/components/form-alert';
import { TextField } from '@/components/form-parts';
import { UseModeCards } from '@/components/properties/use-mode-cards';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { useAction } from '@/components/use-action';
import { saveWizardUse } from '@/server/properties/wizard';

const MAX_ROOMS = 50;

/** Step `use`: the use mode and, for a rooming house, how many rooms to create; leases come later. */
export function StepUse({
  propertyId,
  kind,
  useMode,
  rooms,
  suggestedRooms,
  next,
  back,
}: {
  propertyId: string;
  kind: PropertyKind;
  useMode: UseMode;
  rooms: number;
  /** The `Số phòng` typed on the details step, if any. */
  suggestedRooms: number | null;
  next: string;
  back: string;
}) {
  const t = useTranslations('propertyWizard');
  const router = useRouter();
  const [use, setUse] = useState(useMode);
  const [count, setCount] = useState(() => String(Math.max(rooms, suggestedRooms ?? 0) || ''));
  const [invalid, setInvalid] = useState(false);
  const [failed, setFailed] = useState(false);
  const { pending, run } = useAction();
  const roomingHouse = kind === 'rooming_house';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = count.trim();
    const parsed = text === '' ? 0 : /^\d{1,2}$/.test(text) ? Number(text) : Number.NaN;
    const bad = roomingHouse && (!Number.isInteger(parsed) || parsed > MAX_ROOMS || (text !== '' && parsed < 1));
    setInvalid(bad);
    if (bad) return;
    setFailed(false);
    run(
      () => saveWizardUse(propertyId, { useMode: use, rooms: roomingHouse ? parsed : 0 }),
      (result) => (result.ok ? router.push(next) : setFailed(true)),
    );
  };

  return (
    <form noValidate onSubmit={submit} data-testid="wizard-use" className="flex max-w-3xl flex-col gap-5 rounded-lg border border-border bg-surface p-5 shadow-xs sm:p-6">
      <h2 className="text-headline font-semibold text-text">{t('useTitle')}</h2>
      <UseModeCards value={use} onChange={setUse} />
      {roomingHouse ? (
        <div className="flex flex-col gap-2">
          <TextField
            label={t('roomCount')}
            hint={t('roomHint')}
            testId="room-count"
            value={count}
            maxLength={2}
            inputMode="numeric"
            className="num w-32"
            error={invalid ? t('roomInvalid') : null}
            onChange={setCount}
          />
          {rooms > 0 ? <p className="text-body-sm text-text-muted">{t('roomsExisting', { count: rooms })}</p> : null}
        </div>
      ) : null}
      <div className="flex items-start gap-3 rounded-md bg-bg-subtle px-4 py-3">
        <FileSignature className="mt-0.5 size-5 shrink-0 text-text-secondary" strokeWidth={1.8} aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-body font-medium text-text">{t('leasesLater')}</p>
          <p className="text-body-sm text-text-secondary">{t('leasesHelp')}</p>
        </div>
      </div>
      <FormAlert message={failed ? t('saveFailed') : null} data-testid="wizard-error" />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending} data-testid="save-use">
          {t('saveAndContinue')}
        </Button>
        <Link href={back} className={buttonVariants({ variant: 'secondary' })}>
          {t('back')}
        </Link>
      </div>
    </form>
  );
}
