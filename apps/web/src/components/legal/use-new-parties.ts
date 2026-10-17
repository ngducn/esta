import { compareVietnameseNames } from '@esta/core/names';
import type { NewParty } from '@esta/core/schemas/party';
import { useState } from 'react';
import type { PartyOption } from '@/server/properties/legal';

function optionOf(party: NewParty): PartyOption {
  return { id: party.id, fullName: party.full_name, kind: party.kind, isBank: party.kind === 'organization' && party.bank };
}

/** The saved parties plus the ones quick-added in this form, which exist only here until a save names them. */
export function useNewParties(saved: readonly PartyOption[]) {
  const [pending, setPending] = useState<readonly NewParty[]>([]);
  const parties = [...saved, ...pending.map(optionOf)].sort((a, b) => compareVietnameseNames(a.fullName, b.fullName));
  return { parties, pending, add: (party: NewParty) => setPending((current) => [...current, party]) };
}
