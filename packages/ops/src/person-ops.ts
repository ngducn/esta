import type { Phone } from '@esta/core/phone';
import { searchTokens } from '@esta/core/properties';
import { tenantSchema } from '@esta/core/schemas/lease';
import { idLast4Schema } from '@esta/core/schemas/party';
import { z } from 'zod';
import { dbRefusal, idSchema } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';
import { viewRows, type ViewRows } from './view';

const personInputSchema = z.strictObject({
  id: idSchema,
  person: z.strictObject({
    full_name: tenantSchema.shape.full_name,
    phone: tenantSchema.shape.phone.nullable(),
    /** The screens never send it. */
    id_last4: idLast4Schema.nullable().default(null),
  }),
  /** Ryan's answer to the duplicate question: this is a different person from the ones named. */
  allow_duplicate: z.boolean().default(false),
});
type PersonInput = z.output<typeof personInputSchema>;

type NewPerson = {
  readonly id: string;
  readonly row: { readonly kind: 'individual'; readonly full_name: string; readonly phone: Phone | null; readonly id_last4: string | null; readonly tags: readonly ['tenant'] };
};
export type PersonSaved = Pick<ViewRows['parties'], 'id' | 'full_name' | 'phone'>;
export type DuplicateReason = 'phone' | 'name_and_id_last4';
export type PossibleDuplicate = ViewRows['parties'] & { readonly reasons: readonly DuplicateReason[] };
export type PersonRefusal = { readonly kind: 'possible_duplicate'; readonly people: readonly PossibleDuplicate[] };

/** Diacritics, case and spacing aside, as the property search compares words. */
const foldedName = (name: string) => searchTokens(name).join(' ');

/** People already in the household, or planned earlier in the batch, who may be this one: the same phone, or the same name and last four ID digits. */
async function possibleDuplicates(ctx: OpContext, { id, person }: PersonInput): Promise<PossibleDuplicate[]> {
  const byPhone = person.phone === null ? [] : await viewRows(ctx, 'parties', { phone: person.phone });
  const byId = person.id_last4 === null ? [] : await viewRows(ctx, 'parties', { id_last4: person.id_last4 });
  const name = foldedName(person.full_name);
  const found = new Map<string, PossibleDuplicate>();
  const add = (row: ViewRows['parties'], reason: DuplicateReason) => {
    if (row.id !== id) found.set(row.id, { ...row, reasons: [...(found.get(row.id)?.reasons ?? []), reason] });
  };
  for (const row of byPhone) add(row, 'phone');
  for (const row of byId) if (foldedName(row.full_name) === name) add(row, 'name_and_id_last4');
  return [...found.values()];
}

/** Adds a person tagged tenant, as the lease sheet's quick add does, under the id the caller minted. */
export const personCreate = defineOp<PersonInput, NewPerson, PersonSaved, PersonRefusal>({
  creates: 'parties',
  input: personInputSchema,
  async plan(ctx, input) {
    const [existing] = await viewRows(ctx, 'parties', { id: input.id });
    if (existing !== undefined) return unchanged({ id: existing.id, full_name: existing.full_name, phone: existing.phone });
    const people = input.allow_duplicate ? [] : await possibleDuplicates(ctx, input);
    if (people.length > 0) return refuse({ kind: 'possible_duplicate', people });
    const { full_name, phone, id_last4 } = input.person;
    return change({ id: input.id, row: { kind: 'individual', full_name, phone, id_last4, tags: ['tenant'] } });
  },
  async apply(ctx, { id, row }) {
    const { error } = await ctx.db.from('parties').insert({ ...row, tags: [...row.tags], id, household_id: ctx.householdId });
    return error ? refuse(dbRefusal(error)) : { ok: true, value: { id, full_name: row.full_name, phone: row.phone } };
  },
  writes: ({ id, row }) => [{ kind: 'create', table: 'parties', row: { id, full_name: row.full_name, phone: row.phone, id_last4: row.id_last4 } }],
});
