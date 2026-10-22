import { valuationSchema, type Valuation } from '@esta/core/valuations';
import { z } from 'zod';
import { dbRefusal, idSchema } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';
import { viewRows } from './view';

export type ValuationSaved = { readonly id: string };

async function stored(ctx: OpContext, id: string): Promise<boolean> {
  const { data, error } = await ctx.db.from('valuations').select('id').eq('household_id', ctx.householdId).eq('id', id).maybeSingle();
  if (error) throw new Error(`Reading the valuation failed: ${error.message}`);
  return data !== null;
}

/**
 * Records a valuation under the id the sheet minted (FIN-5), so a retry, or `Hoàn tác` after a delete, writes the one
 * row. The form's rules, the date not after today among them, are read in core before this runs.
 */
export const valuationCreate = defineOp<Valuation, Valuation, ValuationSaved>({
  creates: 'valuations',
  input: valuationSchema,
  async plan(ctx, valuation) {
    if (await stored(ctx, valuation.id)) return unchanged({ id: valuation.id });
    const [property] = await viewRows(ctx, 'properties', { id: valuation.propertyId });
    if (property === undefined) return refuse({ kind: 'invalid', issues: [{ path: 'propertyId', code: 'not_found' }] });
    return change(valuation);
  },
  async apply(ctx, { id, propertyId, asOf, valueVnd, method, sourceUrl, note }) {
    const { error } = await ctx.db.from('valuations').insert({
      id,
      household_id: ctx.householdId,
      property_id: propertyId,
      as_of: asOf,
      value_vnd: valueVnd,
      method,
      source_url: sourceUrl,
      note,
    });
    return error ? refuse(dbRefusal(error)) : { ok: true, value: { id } };
  },
});

const deleteInputSchema = z.strictObject({ id: idSchema });

/** Removes a valuation; the screen keeps its values for `Hoàn tác`, which records it again under the same id. */
export const valuationDelete = defineOp<z.output<typeof deleteInputSchema>, ValuationSaved, ValuationSaved>({
  creates: null,
  input: deleteInputSchema,
  async plan(ctx, { id }) {
    return (await stored(ctx, id)) ? change({ id }) : unchanged({ id });
  },
  async apply(ctx, { id }) {
    const { data, error } = await ctx.db.from('valuations').delete().eq('household_id', ctx.householdId).eq('id', id).select('id');
    if (error) return refuse(dbRefusal(error));
    if (data.length === 0 && (await stored(ctx, id))) return refuse({ kind: 'forbidden' });
    return { ok: true, value: { id } };
  },
});
