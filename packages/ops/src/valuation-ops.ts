import { formatDate, formatVnd } from '@esta/core/format';
import { valuationSchema, type Valuation } from '@esta/core/valuations';
import { z } from 'zod';
import { dbRefusal, idSchema, type CommonRefusal } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';
import { viewRows } from './view';

export type ValuationSaved = { readonly id: string };

async function stored(ctx: OpContext, id: string): Promise<boolean> {
  const { data, error } = await ctx.db.from('valuations').select('id').eq('household_id', ctx.householdId).eq('id', id).maybeSingle();
  if (error) throw new Error(`Reading the valuation failed: ${error.message}`);
  return data !== null;
}

export const valuationCreate = defineOp<Valuation, Valuation, ValuationSaved>({
  creates: 'valuations',
  input: valuationSchema,
  async plan(ctx, valuation) {
    if (await stored(ctx, valuation.id)) return unchanged({ id: valuation.id });
    if (valuation.asOf > ctx.clock.today()) return refuse({ kind: 'invalid', issues: [{ path: 'asOf', code: 'after_today' }] });
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

const recordInputSchema = z
  .strictObject({
    id: idSchema,
    property_id: idSchema,
    as_of: valuationSchema.shape.asOf,
    value_vnd: valuationSchema.shape.valueVnd,
    method: valuationSchema.shape.method,
    source_url: valuationSchema.shape.sourceUrl.default(null),
    note: valuationSchema.shape.note.default(null),
  })
  .transform(({ id, property_id, as_of, value_vnd, method, source_url, note }): Valuation => ({ id, propertyId: property_id, asOf: as_of, valueVnd: value_vnd, method, sourceUrl: source_url, note }));

const CLAUDE_KEYS: Readonly<Record<string, string>> = { propertyId: 'property_id', asOf: 'as_of' };

/** The sheet's refusal names its fields in camelCase; Claude sends snake_case, so the refusal says what Claude sent. */
function inClaudesKeys(refusal: CommonRefusal): CommonRefusal {
  return refusal.kind === 'invalid' ? { kind: 'invalid', issues: refusal.issues.map((issue) => ({ ...issue, path: CLAUDE_KEYS[issue.path] ?? issue.path })) } : refusal;
}

/**
 * VAL: an owner's estimate, a broker's quote, a state price reference or comparables for one property on one day, saved
 * as the valuation sheet saves it. `id` is minted by the batch; a property named by `$ref` is created earlier in it.
 */
export const valuationRecord = defineOp<Valuation, Valuation, ValuationSaved>({
  creates: 'valuations',
  input: recordInputSchema,
  async plan(ctx, valuation) {
    const planned = await valuationCreate.plan(ctx, valuation);
    return planned.ok ? planned : refuse(inClaudesKeys(planned.reason));
  },
  apply: valuationCreate.apply,
  async preview(ctx, { propertyId, asOf, valueVnd }) {
    const [property] = await viewRows(ctx, 'properties', { id: propertyId });
    return { property: property?.nickname ?? null, value_display: formatVnd(valueVnd, 'vi'), as_of_display: formatDate(asOf, 'vi') };
  },
});
