'use client';

import { compareVietnameseNames, idLast4 } from '@esta/core/names';
import type { NewParty } from '@esta/core/schemas/party';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { TextField } from '@/components/form-parts';
import { FormSelect } from '@/components/properties/address-picker';
import { Button } from '@/components/ui/button';
import type { PartyOption } from '@/server/properties/legal';

const LAST4 = /^[0-9]{4}$/;

/** Names a party inline: a name, and for a person only the last 4 ID digits (SPEC D11). Nothing is saved until the form is. */
function QuickAdd({ kind, onAdded, onCancel }: { kind: 'individual' | 'bank'; onAdded: (party: NewParty) => void; onCancel: () => void }) {
  const t = useTranslations('propertyLegal');
  const [name, setName] = useState('');
  const [last4, setLast4] = useState('');
  const [error, setError] = useState<'name' | 'last4' | null>(null);
  const add = () => {
    if (name.trim() === '') return setError('name');
    if (last4 !== '' && !LAST4.test(last4)) return setError('last4');
    setError(null);
    const id = crypto.randomUUID();
    const full_name = name.trim();
    onAdded(kind === 'individual' ? { id, kind, full_name, id_last4: last4 === '' ? null : last4 } : { id, kind: 'organization', full_name, bank: true });
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
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={add} data-testid="quick-add-save">
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

export function PartyAdder({
  parties,
  labels,
  onPick,
  onParty,
}: {
  parties: readonly PartyOption[];
  labels: { choose: string; add: string };
  onPick: (id: string) => void;
  onParty: (party: NewParty) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      {parties.length === 0 ? null : (
        <FormSelect
          label={labels.choose}
          testId="holder-select"
          value=""
          placeholder={labels.choose}
          options={sorted(parties).map((party) => ({ value: party.id, label: party.fullName }))}
          onChange={onPick}
        />
      )}
      {adding ? (
        <QuickAdd
          kind="individual"
          onCancel={() => setAdding(false)}
          onAdded={(party) => {
            onParty(party);
            onPick(party.id);
            setAdding(false);
          }}
        />
      ) : (
        <Button type="button" variant="outline" className="self-start" onClick={() => setAdding(true)} data-testid="add-holder">
          <Plus aria-hidden="true" />
          {labels.add}
        </Button>
      )}
    </>
  );
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
  onParty: (party: NewParty) => void;
}) {
  const t = useTranslations('propertyLegal');
  const byId = new Map(parties.map((party) => [party.id, party]));
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
      <PartyAdder
        parties={parties.filter((party) => !selected.includes(party.id) && !party.isBank)}
        labels={{ choose: t('partyChoose'), add: t('partyAdd') }}
        onPick={(id) => onChange([...selected, id])}
        onParty={onParty}
      />
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
  onParty: (party: NewParty) => void;
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
