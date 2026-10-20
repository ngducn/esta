import { z } from 'zod';

const fullName = z.string().trim().min(1).max(200);

export const idLast4Schema = z.string().regex(/^[0-9]{4}$/);

/**
 * A party made in a form and not yet saved; its id is minted on the client so the saved item can point at it.
 * SPEC D11: a person keeps only the last 4 ID digits, so a longer number is rejected rather than trimmed.
 */
export const newPartySchema = z.discriminatedUnion('kind', [
  z.object({ id: z.uuid(), kind: z.literal('individual'), full_name: fullName, id_last4: idLast4Schema.nullable() }),
  z.object({ id: z.uuid(), kind: z.literal('organization'), full_name: fullName, bank: z.boolean() }),
]);
export type NewParty = z.output<typeof newPartySchema>;

/** Most new parties one save may carry: every holder, owner and bank a form can name. */
export const MAX_NEW_PARTIES = 20;
export const newPartiesSchema = z.array(newPartySchema).max(MAX_NEW_PARTIES);

/** The pending parties a save refers to; one the user added and then dropped is never created. */
export function usedNewParties(pending: readonly NewParty[], referencedIds: readonly string[]): NewParty[] {
  const referenced = new Set(referencedIds);
  return pending.filter((party) => referenced.has(party.id));
}
