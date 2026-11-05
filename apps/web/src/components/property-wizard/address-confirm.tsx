'use client';

import { MapPinned } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { AddressBlock } from '@/components/address-block';
import { FormAlert } from '@/components/form-alert';
import { SuggestionList } from '@/components/properties/legacy-address-suggest';
import { buttonVariants } from '@/components/ui/button-variants';
import { useAction } from '@/components/use-action';
import { shortProvinceName } from '@esta/core/address';
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
  const { pending: saving, run } = useAction();
  const saved = suggestions.find((suggestion) => suggestion.communeCode === current);

  const pick = (suggestion: CurrentUnitSuggestion) => {
    setFailed(false);
    run(
      () => confirmCurrentAddress(propertyId, { communeCode: suggestion.communeCode, provinceCode: suggestion.provinceCode }),
      (ok) => (ok ? setCurrent(suggestion.communeCode) : setFailed(true)),
      false,
    );
  };

  return (
    <section data-testid="address-confirm" aria-labelledby="address-confirm-title" className="flex max-w-3xl flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-xs sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="address-confirm-title" className="flex items-center gap-2 text-headline font-semibold text-text">
          <MapPinned className="size-5 shrink-0 text-text-secondary" strokeWidth={1.8} aria-hidden="true" />
          {t('addressTitle')}
        </h2>
        <p className="max-w-prose text-body text-pretty text-text-secondary">{t('addressBody')}</p>
      </div>
      <div data-testid="certificate-address-text" className="rounded-md bg-bg-subtle px-4 py-3">
        <AddressBlock legal={certificateAddress} current={saved === undefined ? null : `${saved.communeName}, ${shortProvinceName(saved.provinceName)}`} />
      </div>
      {suggestions.length === 0 ? (
        <p className="text-body text-text-secondary">{t('addressNone')}</p>
      ) : (
        <SuggestionList suggestions={suggestions} pickedCommune={current} onPick={pick} disabled={saving} />
      )}
      {saved === undefined ? null : (
        <p role="status" data-testid="address-saved" className="text-body text-text-secondary">
          {t('addressSaved', { commune: saved.communeName })}
        </p>
      )}
      <FormAlert message={failed ? t('addressFailed') : null} />
      <Link href={continueHref} data-testid="review-continue" className={`${buttonVariants({ variant: saved === undefined ? 'secondary' : 'primary' })} self-start`}>
        {saved === undefined ? t('later') : t('continue')}
      </Link>
    </section>
  );
}
