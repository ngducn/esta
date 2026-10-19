'use client';

import { MapPinned } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { SuggestionList } from '@/components/properties/legacy-address-suggest';
import { buttonVariants } from '@/components/ui/button-variants';
import type { CurrentUnitSuggestion } from '@esta/ops';
import { confirmCurrentAddress } from '@/server/properties/wizard';

/** `Theo sổ` as accepted, and every ward it may belong to today as `Hiện nay`; a tap saves the one the user picks. */
export function AddressConfirm({
  propertyId,
  certificateAddress,
  suggestions,
  picked,
  continueHref,
}: {
  propertyId: string;
  certificateAddress: string;
  suggestions: readonly CurrentUnitSuggestion[];
  picked: string | null;
  continueHref: string;
}) {
  const t = useTranslations('propertyWizard');
  const [current, setCurrent] = useState(picked);
  const [failed, setFailed] = useState(false);
  const [saving, startSaving] = useTransition();
  const saved = suggestions.find((suggestion) => suggestion.communeCode === current);

  const pick = (suggestion: CurrentUnitSuggestion) =>
    startSaving(async () => {
      setFailed(false);
      const ok = await confirmCurrentAddress(propertyId, { communeCode: suggestion.communeCode, provinceCode: suggestion.provinceCode }).catch(() => false);
      if (ok) setCurrent(suggestion.communeCode);
      else setFailed(true);
    });

  return (
    <section data-testid="address-confirm" aria-labelledby="address-confirm-title" className="flex max-w-3xl flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="address-confirm-title" className="flex items-center gap-2 text-lead font-bold text-ink">
          <MapPinned className="size-5 shrink-0 text-ink-2" strokeWidth={1.8} aria-hidden="true" />
          {t('addressTitle')}
        </h2>
        <p className="max-w-prose text-body text-pretty text-ink-2">{t('addressBody')}</p>
      </div>
      <div className="flex flex-col gap-1 rounded-md bg-surface-2 px-4 py-3">
        <p className="text-small font-semibold text-ink-2">{t('addressOnCertificate')}</p>
        <p data-testid="certificate-address-text" className="text-body break-words text-ink">
          {certificateAddress}
        </p>
      </div>
      {suggestions.length === 0 ? (
        <p className="text-body text-ink-2">{t('addressNone')}</p>
      ) : (
        <SuggestionList suggestions={suggestions} pickedCommune={current} onPick={pick} disabled={saving} />
      )}
      {saved === undefined ? null : (
        <p role="status" data-testid="address-saved" className="text-body text-ink-2">
          {t('addressSaved', { commune: saved.communeName })}
        </p>
      )}
      {failed ? (
        <p role="alert" className="text-body font-semibold text-overdue">
          {t('addressFailed')}
        </p>
      ) : null}
      <Link href={continueHref} data-testid="review-continue" className={`${buttonVariants({ variant: saved === undefined ? 'outline' : 'primary' })} self-start`}>
        {saved === undefined ? t('later') : t('continue')}
      </Link>
    </section>
  );
}
