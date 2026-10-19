import { normalizeName, type ExistingParty } from '../extraction/acceptance';
import type { OwnershipShare } from '../schemas/ownership';
import { FULL_SHARE_BP } from './ownership';

export type CertificateHolder = { readonly fullName: string; readonly idLast4: string | null };

/**
 * PRP-3's starting set from a certificate: the parties its review linked as holders (`linked`, the certificate's
 * `holder_party_ids` in printed order), split equally in basis points with the remainder on the first, so the set
 * totals 10000. When the certificate links none, each holder is matched to the one party with the same name and last
 * four ID digits; a holder that fits no party, or more than one, is left out, and two holders on one party count once.
 */
export function ownersFromHolders(holders: readonly CertificateHolder[], parties: readonly ExistingParty[], linked: readonly string[]): OwnershipShare[] {
  const matched =
    linked.length > 0
      ? linked
      : holders.flatMap((holder) => {
          const name = normalizeName(holder.fullName);
          const fits = parties.filter((party) => party.idLast4 === holder.idLast4 && normalizeName(party.fullName) === name);
          return fits.length === 1 ? fits.map((party) => party.id) : [];
        });
  const partyIds = [...new Set(matched)];
  const each = Math.floor(FULL_SHARE_BP / Math.max(1, partyIds.length));
  return partyIds.map((party_id, index) => ({
    party_id,
    share_bp: index === 0 ? FULL_SHARE_BP - each * (partyIds.length - 1) : each,
    named_on_certificate: true,
    since: null,
  }));
}
