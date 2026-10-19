import type { LeaseStatus } from '@esta/core/lease';
import type { Result } from '@esta/core/result';
import { leaseDraftSchema, type LeaseDraft } from '@esta/core/schemas/lease';
import { z } from 'zod';
import { changedColumns, dbRefusal, idSchema, invalid, type Changed, type CommonRefusal } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';
import { LEASE_DRAFT_KEYS, viewRows, type ViewRows } from './view';

const createInputSchema = z.strictObject({ id: idSchema, property_id: idSchema.optional(), lease: leaseDraftSchema });
const editInputSchema = z.strictObject({ id: idSchema, property_id: idSchema.optional(), set: z.partialRecord(z.enum(LEASE_DRAFT_KEYS), z.unknown()) });

/** The draft with the columns the database would default spelled out, so a later item reads the row the insert writes. */
type NewLease = {
  readonly id: string;
  readonly row: LeaseDraft & { readonly property_id: string; readonly status: 'draft'; readonly paid_through_date: null; readonly due_offset_days: 0 };
};
type LeaseEdit = { readonly id: string } & Changed<LeaseDraft>;
export type LeaseSaved = { readonly id: string };
export type LeaseRefusal = { readonly kind: 'not_draft'; readonly status: LeaseStatus };

const issue = (path: string, code: string): CommonRefusal => ({ kind: 'invalid', issues: [{ path, code }] });

/** The property of the unit the lease names, which must be the one the caller expects when it names one. */
async function propertyOf(ctx: OpContext, path: string, unitId: string, expected: string | undefined): Promise<Result<string, CommonRefusal>> {
  const [unit] = await viewRows(ctx, 'units', { id: unitId });
  if (unit === undefined) return refuse(issue(path, 'not_found'));
  return expected === undefined || unit.property_id === expected ? { ok: true, value: unit.property_id } : refuse(issue(path, 'other_property'));
}

async function tenantRefusal(ctx: OpContext, path: string, tenantId: string | null): Promise<CommonRefusal | null> {
  if (tenantId === null) return null;
  const [tenant] = await viewRows(ctx, 'parties', { id: tenantId });
  return tenant === undefined ? issue(path, 'not_found') : null;
}

const draftOf = (lease: ViewRows['leases']) => Object.fromEntries(LEASE_DRAFT_KEYS.map((key) => [key, lease[key]]));

/** Saves a draft lease under the id the caller minted, on the property its unit belongs to. */
export const leaseCreate = defineOp<z.output<typeof createInputSchema>, NewLease, LeaseSaved>({
  creates: 'leases',
  input: createInputSchema,
  async plan(ctx, { id, property_id, lease }) {
    const [existing] = await viewRows(ctx, 'leases', { id });
    if (existing !== undefined) return unchanged({ id });
    const property = await propertyOf(ctx, 'lease.unit_id', lease.unit_id, property_id);
    if (!property.ok) return property;
    const tenant = await tenantRefusal(ctx, 'lease.tenant_party_id', lease.tenant_party_id);
    if (tenant !== null) return refuse(tenant);
    return change({ id, row: { ...lease, property_id: property.value, status: 'draft', paid_through_date: null, due_offset_days: 0 } });
  },
  async apply(ctx, { id, row }) {
    const { error } = await ctx.db.from('leases').insert({ ...row, id, household_id: ctx.householdId });
    return error ? refuse(dbRefusal(error)) : { ok: true, value: { id } };
  },
  writes: ({ id, row }) => [{ kind: 'create', table: 'leases', row: { id, ...row } }],
});

/**
 * `set` names the draft terms to change; the rest keep their stored values and the whole is checked as the lease form
 * checks it. An active lease changes only through an amendment (P3-08).
 */
export const leaseEdit = defineOp<z.output<typeof editInputSchema>, LeaseEdit, LeaseSaved, LeaseRefusal>({
  creates: null,
  input: editInputSchema,
  async plan(ctx, { id, property_id, set }) {
    const [current] = await viewRows(ctx, 'leases', { id });
    if (current === undefined || (property_id !== undefined && current.property_id !== property_id)) return refuse({ kind: 'not_found' });
    if (current.status !== 'draft') return refuse({ kind: 'not_draft', status: current.status });
    const draft = leaseDraftSchema.safeParse({ ...draftOf(current), ...set });
    if (!draft.success) return refuse(invalid(draft.error));
    const changed = changedColumns<LeaseDraft>(current, draft.data, LEASE_DRAFT_KEYS);
    if (changed === null) return unchanged({ id });
    if ('unit_id' in changed.set) {
      const property = await propertyOf(ctx, 'set.unit_id', draft.data.unit_id, current.property_id);
      if (!property.ok) return property;
    }
    const tenant = 'tenant_party_id' in changed.set ? await tenantRefusal(ctx, 'set.tenant_party_id', draft.data.tenant_party_id) : null;
    return tenant === null ? change({ id, ...changed }) : refuse(tenant);
  },
  async apply(ctx, { id, set }) {
    const { data, error } = await ctx.db.from('leases').update(set).eq('household_id', ctx.householdId).eq('id', id).eq('status', 'draft').select('id').maybeSingle();
    if (error) return refuse(dbRefusal(error));
    // No draft matched: planning again says whether it left draft or went away.
    return data === null ? refuse({ kind: 'conflict' }) : { ok: true, value: data };
  },
  writes: ({ id, set }) => [{ kind: 'set', table: 'leases', id, set }],
});
