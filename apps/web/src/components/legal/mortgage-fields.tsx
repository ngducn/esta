'use client';

import type { IsoDate } from '@esta/core/date';
import type { Vnd } from '@esta/core/money';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import type { CertificateStatus, Mortgage } from '@esta/core/schemas/legal';
import type { NewParty } from '@esta/core/schemas/party';
import { useTranslations } from 'next-intl';
import { DateInput } from '@/components/date-input';
import { MoneyInput } from '@/components/money/money-input';
import { dateInputProps, dateReading, type DateReading } from '@/components/use-date-field';
import type { PartyOption } from '@/server/properties/legal';
import { BankPicker } from './party-picker';

export type MortgageDraft = { readonly bankId: string; readonly amountText: string; readonly registeredOn: DateReading; readonly releasedOn: DateReading };
export type MortgageInvalid = 'bank' | 'amount' | 'released' | 'date';

export function mortgageDraft(mortgage: Mortgage | null): MortgageDraft {
  return {
    bankId: mortgage?.bank_party_id ?? '',
    amountText: mortgage === null ? '' : String(mortgage.amount_vnd),
    registeredOn: dateReading(mortgage?.registered_on ?? null),
    releasedOn: dateReading(mortgage?.released_on ?? null),
  };
}

type MortgageInput = { bank_party_id: string; amount_vnd: Vnd; registered_on?: IsoDate; released_on?: IsoDate };

/**
 * `mortgaged` needs an open mortgage. Any other status keeps a mortgage only as a released one, so its release date is
 * required there, and empty fields mean no mortgage at all. Only the registration date can be unreadable on its own: a shown
 * release date that is unreadable reads as null, so the release check refuses it, and a mortgaged status hides the field.
 */
export function readMortgage(status: CertificateStatus, draft: MortgageDraft): { ok: true; value: MortgageInput | null } | { ok: false; invalid: MortgageInvalid } {
  const empty = draft.bankId === '' && draft.amountText.trim() === '';
  if (status !== 'mortgaged' && empty) return { ok: true, value: null };
  if (draft.bankId === '') return { ok: false, invalid: 'bank' };
  const amount = parseVndInput(draft.amountText);
  if (!amount.ok) return { ok: false, invalid: 'amount' };
  if (draft.registeredOn.unreadable) return { ok: false, invalid: 'date' };
  if (status !== 'mortgaged' && draft.releasedOn.value === null) return { ok: false, invalid: 'released' };
  return {
    ok: true,
    value: {
      bank_party_id: draft.bankId,
      amount_vnd: amount.value,
      ...(draft.registeredOn.value === null ? {} : { registered_on: draft.registeredOn.value }),
      ...(status === 'mortgaged' || draft.releasedOn.value === null ? {} : { released_on: draft.releasedOn.value }),
    },
  };
}

export function MortgageFields({
  status,
  draft,
  onChange,
  parties,
  onParty,
  invalid,
}: {
  status: CertificateStatus;
  draft: MortgageDraft;
  onChange: (draft: MortgageDraft) => void;
  parties: readonly PartyOption[];
  onParty: (party: NewParty) => void;
  invalid: MortgageInvalid | null;
}) {
  const t = useTranslations('propertyLegal');
  return (
    <div data-testid="mortgage-fields" className="flex flex-col gap-4">
      <p className="text-body-sm text-text-muted">{t('mortgageHint')}</p>
      <BankPicker parties={parties} value={draft.bankId} onChange={(bankId) => onChange({ ...draft, bankId })} onParty={onParty} invalid={invalid === 'bank'} />
      <MoneyInput label={t('mortgageAmount')} defaultText={draft.amountText} onTextChange={(amountText) => onChange({ ...draft, amountText })} />
      {invalid === 'amount' ? (
        <p role="alert" className="text-body-sm text-danger-text">
          {t('amountRequired')}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <DateInput
          label={t('registeredOnLabel')}
          {...dateInputProps(draft.registeredOn, (registeredOn) => onChange({ ...draft, registeredOn }))}
        />
        {status === 'mortgaged' ? null : (
          <div className="flex flex-col gap-1">
            <DateInput
              label={t('releasedOnLabel')}
              {...dateInputProps(draft.releasedOn, (releasedOn) => onChange({ ...draft, releasedOn }))}
            />
            {invalid === 'released' ? (
              <p role="alert" className="text-body-sm text-danger-text">
                {t('releasedRequired')}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
