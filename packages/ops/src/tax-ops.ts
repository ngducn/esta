import { MAX_AMOUNT_VND, vnd, type Vnd } from '@esta/core/money';
import { z } from 'zod';
import { dbRefusal, idSchema } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';
import { readOtherBusinessRevenue } from './tax';

const taxInputSchema = z.strictObject({
  party_id: idSchema,
  year: z.number().int().min(2000).max(2100),
  other_business_revenue_vnd: z.number().int().min(0).max(MAX_AMOUNT_VND).transform(vnd),
});
type TaxInput = z.output<typeof taxInputSchema>;
export type TaxInputSaved = { readonly other_business_revenue_vnd: Vnd };

async function partyExists(ctx: OpContext, partyId: string): Promise<boolean> {
  const { data, error } = await ctx.db.from('parties').select('id').eq('household_id', ctx.householdId).eq('id', partyId);
  if (error) throw new Error(`Reading the owner failed: ${error.message}`);
  return data.length > 0;
}

/**
 * FIN-3 `Doanh thu kinh doanh khác`: an owner's other business revenue for a year. One row per owner and year, so the
 * write is an upsert and a retried save plans as unchanged. A missing row reads as 0, so saving 0 there is unchanged too.
 */
export const taxInputSave = defineOp<TaxInput, TaxInput, TaxInputSaved>({
  creates: 'owner_tax_inputs',
  input: taxInputSchema,
  async plan(ctx, input) {
    if (!(await partyExists(ctx, input.party_id))) return refuse({ kind: 'not_found' });
    const saved = await readOtherBusinessRevenue(ctx.db, ctx.householdId, { partyId: input.party_id, year: input.year });
    return saved === input.other_business_revenue_vnd ? unchanged({ other_business_revenue_vnd: saved }) : change(input);
  },
  async apply(ctx, input) {
    const { error } = await ctx.db.from('owner_tax_inputs').upsert({ ...input, household_id: ctx.householdId }, { onConflict: 'household_id,party_id,year' });
    return error ? refuse(dbRefusal(error)) : { ok: true, value: { other_business_revenue_vnd: input.other_business_revenue_vnd } };
  },
});
