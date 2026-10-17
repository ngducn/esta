'use client';

import { compareVietnameseNames, idLast4 } from '@esta/core/names';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { quickAddParty } from '@/app/(app)/properties/[id]/legal/actions';
import { TextField } from '@/components/form-parts';
import { FormSelect } from '@/components/properties/address-picker';
import { Button } from '@/components/ui/button';
import type { PartyOption } from '@/server/properties/legal';

const LAST4 = /^[0-9]{4}$/;

/** Adds a party inline: a name, and for a person only the last 4 ID digits (SPEC D11), never the full number. */
function QuickAdd({ kind, onAdded, onCancel }: { kind: 'individual' | 'bank'; onAdded: (party: PartyOption) => void; onCancel: () => void }) {
  const t = useTranslations('propertyLegal');
  const [name, setName] = useState('');
  const [last4, setLast4] = useState('');
  const [error, setError] = useState<'name' | 'last4' | 'failed' | null>(null);
  const [pending, startTransition] = useTransition();
  const add = () => {
    if (name.trim() === '') return setError('name');
    if (last4 !== '' && !LAST4.test(last4)) return setError('last4');
    setError(null);
    const input =
      kind === 'individual'
        ? { kind: 'individual', full_name: name, id_last4: last4 === '' ? null : last4 }
        : { kind: 'organization', full_name: name, bank: true };
    startTransition(async () => {
      const result = await quickAddParty(input).catch(() => ({ ok: false }) as const);
      if (result.ok) onAdded(result.party);
      else setError('failed');
    });
  };
  return (
    <div data-testid={`quick-add-${kind}`} className="flex flex-col gap-3 rounded-md border border-rule bg-surface-2 p-3 sm:p-4">
      <TextField
        label={kind === 'individual' ? t('partyName') : t('partyBankName')}
        testId="quick-add-name"
        value={name}
        maxLength={200}
        error={error === 'name' ? t('partyNameRequired') : null}
        onChange={setName}
      />
      {kind === 'individual' ? (
        <TextField
          label={t('partyLast4')}
          hint={t('partyLast4Hint')}
          testId="quick-add-last4"
          value={last4}
          inputMode="numeric"
          className="max-w-32 figures"
          error={error === 'last4' ? t('partyLast4Invalid') : null}
          onChange={(text) => setLast4(idLast4(text))}
        />
      ) : null}
      {error === 'failed' ? (
        <p role="alert" className="text-small text-overdue">
          {t('partyFailed')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={add} disabled={pending} data-testid="quick-add-save">
          {t('partySave')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('partyCancel')}
        </Button>
      </div>
    </div>
  );
}

function sorted(parties: readonly PartyOption[]): PartyOption[] {
  return [...parties].sort((a, b) => compareVietnameseNames(a.fullName, b.fullName));
}

export function HolderPicker({
  parties,
  selected,
  onChange,
  onParty,
}: {
  parties: readonly PartyOption[];
  selected: readonly string[];
  onChange: (ids: readonly string[]) => void;
  onParty: (party: PartyOption) => void;
}) {
  const t = useTranslations('propertyLegal');
  const [adding, setAdding] = useState(false);
  const byId = new Map(parties.map((party) => [party.id, party]));
  const rest = sorted(parties.filter((party) => !selected.includes(party.id) && !party.isBank));
  return (
    <div className="flex flex-col gap-3">
      {selected.length === 0 ? (
        <p className="text-body text-ink-muted">{t('noHolders')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2" data-testid="holders">
          {selected.map((id) => {
            const name = byId.get(id)?.fullName ?? id;
            return (
              <li key={id} className="flex min-h-touch items-center gap-1 rounded-full border border-rule bg-surface-2 pr-1 pl-3 text-body text-ink">
                <span className="break-words">{name}</span>
                <button
                  type="button"
                  aria-label={t('partyRemove', { name })}
                  onClick={() => onChange(selected.filter((other) => other !== id))}
                  className="flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-rule hover:text-ink"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {rest.length === 0 ? null : (
        <FormSelect
          label={t('partyChoose')}
          testId="holder-select"
          value=""
          placeholder={t('partyChoose')}
          options={rest.map((party) => ({ value: party.id, label: party.fullName }))}
          onChange={(id) => onChange([...selected, id])}
        />
      )}
      {adding ? (
        <QuickAdd
          kind="individual"
          onCancel={() => setAdding(false)}
          onAdded={(party) => {
            onParty(party);
            onChange([...selected, party.id]);
            setAdding(false);
          }}
        />
      ) : (
        <Button type="button" variant="outline" className="self-start" onClick={() => setAdding(true)} data-testid="add-holder">
          <Plus aria-hidden="true" />
          {t('partyAdd')}
        </Button>
      )}
    </div>
  );
}

export function BankPicker({
  parties,
  value,
  onChange,
  onParty,
  invalid,
}: {
  parties: readonly PartyOption[];
  value: string;
  onChange: (id: string) => void;
  onParty: (party: PartyOption) => void;
  invalid: boolean;
}) {
  const t = useTranslations('propertyLegal');
  const [adding, setAdding] = useState(false);
  const organizations = parties.filter((party) => party.kind === 'organization');
  const options = [...sorted(organizations.filter((party) => party.isBank)), ...sorted(organizations.filter((party) => !party.isBank))];
  return (
    <div className="flex flex-col gap-3">
      <FormSelect
        label={t('bank')}
        testId="bank-select"
        value={value}
        options={[{ value: '', label: t('bankNone') }, ...options.map((party) => ({ value: party.id, label: party.fullName }))]}
        onChange={onChange}
      />
      {invalid ? (
        <p role="alert" className="text-small text-overdue">
          {t('bankRequired')}
        </p>
      ) : null}
      {adding ? (
        <QuickAdd
          kind="bank"
          onCancel={() => setAdding(false)}
          onAdded={(party) => {
            onParty(party);
            onChange(party.id);
            setAdding(false);
          }}
        />
      ) : (
        <Button type="button" variant="outline" className="self-start" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" />
          {t('partyAddBank')}
        </Button>
      )}
    </div>
  );
}
