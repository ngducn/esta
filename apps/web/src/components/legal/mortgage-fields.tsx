'use client';

import type { IsoDate } from '@esta/core/date';
import type { Vnd } from '@esta/core/money';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import type { CertificateStatus, Mortgage } from '@esta/core/schemas/legal';
import type { NewParty } from '@esta/core/schemas/party';
import { useTranslations } from 'next-intl';
import { DateInput } from '@/components/date-input';
import { MoneyInput } from '@/components/money/money-input';
import type { PartyOption } from '@/server/properties/legal';
import { BankPicker } from './party-picker';

export type MortgageDraft = { readonly bankId: string; readonly amountText: string; readonly registeredOn: IsoDate | null; readonly releasedOn: IsoDate | null };
export type MortgageInvalid = 'bank' | 'amount' | 'released';

export function mortgageDraft(mortgage: Mortgage | null): MortgageDraft {
  return {
    bankId: mortgage?.bank_party_id ?? '',
    amountText: mortgage === null ? '' : String(mortgage.amount_vnd),
    registeredOn: mortgage?.registered_on ?? null,
    releasedOn: mortgage?.released_on ?? null,
  };
}

type MortgageInput = { bank_party_id: string; amount_vnd: Vnd; registered_on?: IsoDate; released_on?: IsoDate };

/**
 * `mortgaged` needs an open mortgage. Any other status keeps a mortgage only as a released one, so its release date is
 * required there, and empty fields mean no mortgage at all.
 */
export function readMortgage(status: CertificateStatus, draft: MortgageDraft): { ok: true; value: MortgageInput | null } | { ok: false; invalid: MortgageInvalid } {
  const empty = draft.bankId === '' && draft.amountText.trim() === '';
  if (status !== 'mortgaged' && empty) return { ok: true, value: null };
  if (draft.bankId === '') return { ok: false, invalid: 'bank' };
  const amount = parseVndInput(draft.amountText);
  if (!amount.ok) return { ok: false, invalid: 'amount' };
  if (status !== 'mortgaged' && draft.releasedOn === null) return { ok: false, invalid: 'released' };
  return {
    ok: true,
    value: {
      bank_party_id: draft.bankId,
      amount_vnd: amount.value,
      ...(draft.registeredOn === null ? {} : { registered_on: draft.registeredOn }),
      ...(status === 'mortgaged' || draft.releasedOn === null ? {} : { released_on: draft.releasedOn }),
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
      <p className="text-small text-ink-muted">{t('mortgageHint')}</p>
      <BankPicker parties={parties} value={draft.bankId} onChange={(bankId) => onChange({ ...draft, bankId })} onParty={onParty} invalid={invalid === 'bank'} />
      <MoneyInput label={t('mortgageAmount')} defaultText={draft.amountText} onTextChange={(amountText) => onChange({ ...draft, amountText })} />
      {invalid === 'amount' ? (
        <p role="alert" className="text-small text-overdue">
          {t('amountRequired')}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <DateInput
          label={t('registeredOnLabel')}
          {...(draft.registeredOn === null ? {} : { defaultValue: draft.registeredOn })}
          onValueChange={(registeredOn) => onChange({ ...draft, registeredOn })}
        />
        {status === 'mortgaged' ? null : (
          <div className="flex flex-col gap-1">
            <DateInput
              label={t('releasedOnLabel')}
              {...(draft.releasedOn === null ? {} : { defaultValue: draft.releasedOn })}
              onValueChange={(releasedOn) => onChange({ ...draft, releasedOn })}
            />
            {invalid === 'released' ? (
              <p role="alert" className="text-small text-overdue">
                {t('releasedRequired')}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
