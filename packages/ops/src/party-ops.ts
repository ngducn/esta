import { z } from 'zod';
import { dbRefusal, idSchema, type CommonRefusal } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';
import { viewRows } from './view';

export const REDACTED_NAME = 'Đã xóa';
const DOCUMENTS_BUCKET = 'documents';
const REMOVE_ATTEMPTS = 3;

const partyRedactInputSchema = z.strictObject({ id: idSchema });
type PartyRedactInput = z.output<typeof partyRedactInputSchema>;
export type PartyRedacted = { readonly id: string; readonly removedFiles: number };
/** `files_left`: the details are gone but some ID card files could not be removed yet; erasing again does not find them. */
export type PartyRefusal = { readonly kind: 'active_lease' | 'deposit_held' | 'files_left' };

const SENTINELS: Readonly<Record<string, PartyRefusal | CommonRefusal>> = {
  ESTA_PARTY_ACTIVE_LEASE: { kind: 'active_lease' },
  ESTA_PARTY_DEPOSIT_HELD: { kind: 'deposit_held' },
};

async function holdsIdCard(ctx: OpContext, partyId: string): Promise<boolean> {
  const { data, error } = await ctx.db.from('documents').select('id').eq('household_id', ctx.householdId).eq('party_id', partyId).eq('category', 'id_card').limit(1);
  if (error) throw new Error(`Reading the party's documents failed: ${error.message}`);
  return data.length > 0;
}

async function removeFiles(ctx: OpContext, names: readonly string[]): Promise<boolean> {
  if (names.length === 0) return true;
  for (let attempt = 0; attempt < REMOVE_ATTEMPTS; attempt += 1) {
    const { data, error } = await ctx.db.storage.from(DOCUMENTS_BUCKET).remove([...names]);
    if (!error && data.length === names.length) return true;
  }
  return false;
}

/**
 * DOMAIN-VN §8: erases who a former tenant is and keeps what they owed and paid. `redact_party` refuses while the
 * person has a running lease or a held deposit, clears the contact fields, deletes the ID card documents and says
 * which files they left in Storage. Storage refuses a delete from SQL, so the admin's session removes those files
 * once no document row names them.
 */
export const partyRedact = defineOp<PartyRedactInput, PartyRedactInput, PartyRedacted, PartyRefusal>({
  creates: null,
  input: partyRedactInputSchema,
  async plan(ctx, input) {
    const [party] = await viewRows(ctx, 'parties', { id: input.id });
    if (party === undefined) return refuse({ kind: 'not_found' });
    if (party.full_name === REDACTED_NAME && !(await holdsIdCard(ctx, input.id))) return unchanged({ id: input.id, removedFiles: 0 });
    return change(input);
  },
  async apply(ctx, { id }) {
    const { data, error } = await ctx.db.rpc('redact_party', { p_party_id: id, p_as_of: ctx.clock.today() });
    if (error) return refuse(dbRefusal(error, SENTINELS));
    if (!(await removeFiles(ctx, data))) return refuse({ kind: 'files_left' });
    return { ok: true, value: { id, removedFiles: data.length } };
  },
});
