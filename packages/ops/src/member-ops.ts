import { z } from 'zod';
import { dbRefusal, idSchema, writtenRow, type Written } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';

const ROLES = ['admin', 'member', 'viewer'] as const;
const roleSchema = z.enum(ROLES);

/** `last_admin` and `operator` come from the guards on `household_members`; `already_member` and `already_invited` from the invite check. */
export type MemberRefusal = { readonly kind: 'last_admin' | 'operator' | 'already_member' | 'already_invited' };
export type MemberSaved = { readonly id: string };

const SENTINELS = {
  'a household keeps at least one admin who has signed in': { kind: 'last_admin' },
  'only an operator of the household can change or remove an operator': { kind: 'operator' },
  'the operator keeps the admin role and the row': { kind: 'operator' },
} as const;

const renameSchema = z.strictObject({ name: z.string().trim().min(1).max(120) });
const inviteSchema = z.strictObject({ email: z.string().trim().toLowerCase().pipe(z.email()), role: roleSchema });
const roleChangeSchema = z.strictObject({ id: idSchema, role: roleSchema });
const removeSchema = z.strictObject({ id: idSchema });
type Rename = z.output<typeof renameSchema>;
type Invite = z.output<typeof inviteSchema>;
type RoleChange = z.output<typeof roleChangeSchema>;
type Remove = z.output<typeof removeSchema>;

async function storedMember(ctx: OpContext, id: string) {
  const { data, error } = await ctx.db.from('household_members').select('id, role, user_id').eq('household_id', ctx.householdId).eq('id', id).maybeSingle();
  if (error) throw new Error(`Reading the member failed: ${error.message}`);
  return data;
}

const settled = (ctx: OpContext, id: string, written: Written) => writtenRow(id, written, async () => (await storedMember(ctx, id)) !== null, SENTINELS);

export const householdRename = defineOp<Rename, Rename, MemberSaved, MemberRefusal>({
  creates: null,
  input: renameSchema,
  async plan(ctx, { name }) {
    const { data, error } = await ctx.db.from('households').select('name').eq('id', ctx.householdId).maybeSingle();
    if (error) throw new Error(`Reading the household failed: ${error.message}`);
    if (data === null) return refuse({ kind: 'not_found' });
    return data.name === name ? unchanged({ id: ctx.householdId }) : change({ name });
  },
  async apply(ctx, { name }) {
    const { data, error } = await ctx.db.from('households').update({ name }).eq('id', ctx.householdId).select('id');
    if (error) return refuse(dbRefusal(error));
    return data.length > 0 ? { ok: true, value: { id: ctx.householdId } } : refuse({ kind: 'forbidden' });
  },
});

export const memberInvite = defineOp<Invite, Invite, MemberSaved, MemberRefusal>({
  creates: 'household_members',
  input: inviteSchema,
  async plan(ctx, input) {
    const { data, error } = await ctx.db.from('household_members').select('id, role, user_id').eq('household_id', ctx.householdId).eq('invited_email', input.email).maybeSingle();
    if (error) throw new Error(`Reading the invite failed: ${error.message}`);
    if (data === null) return change(input);
    if (data.user_id !== null) return refuse({ kind: 'already_member' });
    return data.role === input.role ? unchanged({ id: data.id }) : refuse({ kind: 'already_invited' });
  },
  async apply(ctx, { email, role }) {
    const { data, error } = await ctx.db.rpc('invite_member', { p_household_id: ctx.householdId, p_email: email, p_role: role });
    return error ? refuse(dbRefusal(error, SENTINELS)) : { ok: true, value: { id: data } };
  },
});

export const memberSetRole = defineOp<RoleChange, RoleChange, MemberSaved, MemberRefusal>({
  creates: null,
  input: roleChangeSchema,
  async plan(ctx, input) {
    const current = await storedMember(ctx, input.id);
    if (current === null) return refuse({ kind: 'not_found' });
    return current.role === input.role ? unchanged({ id: input.id }) : change(input);
  },
  async apply(ctx, { id, role }) {
    return settled(ctx, id, await ctx.db.from('household_members').update({ role }).eq('household_id', ctx.householdId).eq('id', id).select('id'));
  },
});

export const memberRemove = defineOp<Remove, Remove, MemberSaved, MemberRefusal>({
  creates: null,
  input: removeSchema,
  async plan(ctx, { id }) {
    return (await storedMember(ctx, id)) === null ? unchanged({ id }) : change({ id });
  },
  async apply(ctx, { id }) {
    return settled(ctx, id, await ctx.db.from('household_members').delete().eq('household_id', ctx.householdId).eq('id', id).select('id'));
  },
});
