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
export type PartyRefusal = { readonly kind: 'active_lease' | 'deposit_held' | 'files_left' };

const SENTINELS: Readonly<Record<string, PartyRefusal | CommonRefusal>> = {
  ESTA_PARTY_ACTIVE_LEASE: { kind: 'active_lease' },
  ESTA_PARTY_DEPOSIT_HELD: { kind: 'deposit_held' },
  ESTA_PARTY_NOT_TENANT: { kind: 'not_found' },
};

async function leftToErase(ctx: OpContext, partyId: string): Promise<boolean> {
  const leases = await ctx.db.from('leases').select('id').eq('household_id', ctx.householdId).eq('tenant_party_id', partyId);
  if (leases.error) throw new Error(`Reading the party's leases failed: ${leases.error.message}`);
  const onLease = leases.data.length === 0 ? '' : `,lease_id.in.(${leases.data.map((lease) => lease.id).join(',')})`;
  const cards = await ctx.db.from('documents').select('id').eq('household_id', ctx.householdId).eq('category', 'id_card').or(`party_id.eq.${partyId}${onLease}`).limit(1);
  if (cards.error) throw new Error(`Reading the party's documents failed: ${cards.error.message}`);
  if (cards.data.length > 0) return true;
  const pending = await ctx.db.rpc('party_pending_files', { p_party_id: partyId });
  if (pending.error) throw new Error(`Reading the party's pending files failed: ${pending.error.message}`);
  return pending.data.length > 0;
}

/** Each try removes what the last one left, so a removal that finishes over two tries is a success. */
async function removeFiles(ctx: OpContext, names: readonly string[]): Promise<boolean> {
  let left = [...names];
  for (let attempt = 0; attempt < REMOVE_ATTEMPTS && left.length > 0; attempt += 1) {
    const { data, error } = await ctx.db.storage.from(DOCUMENTS_BUCKET).remove(left);
    if (error) continue;
    const gone = new Set(data.map((object) => object.name));
    left = left.filter((name) => !gone.has(name));
  }
  return left.length === 0;
}

/**
 * Storage refuses a delete from SQL, so the admin's session removes the ID card files once no document row names them.
 * The database keeps the names of files not yet removed, hides them from everyone but an admin, and hands them back to
 * the next call, so an interrupted erase is finished by erasing again.
 */
export const partyRedact = defineOp<PartyRedactInput, PartyRedactInput, PartyRedacted, PartyRefusal>({
  creates: null,
  input: partyRedactInputSchema,
  async plan(ctx, input) {
    const [party] = await viewRows(ctx, 'parties', { id: input.id });
    if (party === undefined) return refuse({ kind: 'not_found' });
    if (party.full_name === REDACTED_NAME && !(await leftToErase(ctx, input.id))) return unchanged({ id: input.id, removedFiles: 0 });
    return change(input);
  },
  async apply(ctx, { id }) {
    const { data, error } = await ctx.db.rpc('redact_party', { p_party_id: id, p_as_of: ctx.clock.today() });
    if (error) return refuse(dbRefusal(error, SENTINELS));
    if (!(await removeFiles(ctx, data))) return refuse({ kind: 'files_left' });
    return { ok: true, value: { id, removedFiles: data.length } };
  },
});
