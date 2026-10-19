import { normalizeName, type ExistingParty } from '../extraction/acceptance';
import type { OwnershipShare } from '../schemas/ownership';
import { FULL_SHARE_BP } from './ownership';

export type CertificateHolder = { readonly fullName: string; readonly idLast4: string | null };

/**
 * PRP-3's starting set from a certificate: each holder matched to the party with the same name and last four ID digits,
 * as accepting the certificate matched them, split equally in basis points with the remainder on the first holder, so
 * the set totals 10000. A holder with no such party is left out, and two holders matched to one party count once.
 */
export function ownersFromHolders(holders: readonly CertificateHolder[], parties: readonly ExistingParty[]): OwnershipShare[] {
  const partyIds = [
    ...new Set(
      holders.flatMap((holder) => {
        const name = normalizeName(holder.fullName);
        const match = parties.find((party) => party.idLast4 === holder.idLast4 && normalizeName(party.fullName) === name);
        return match === undefined ? [] : [match.id];
      }),
    ),
  ];
  const each = Math.floor(FULL_SHARE_BP / Math.max(1, partyIds.length));
  return partyIds.map((party_id, index) => ({
    party_id,
    share_bp: index === 0 ? FULL_SHARE_BP - each * (partyIds.length - 1) : each,
    named_on_certificate: true,
    since: null,
  }));
}
