import { formatCurrentAddress } from '@esta/core/address';
import { propertyInputSchema, type PropertyInput } from '@esta/core/schemas/property';
import type { Tables } from '@esta/db';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { isCommuneOf } from './address';
import { dbRefusal, idSchema, invalid, type CommonRefusal } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';
import { readPropertyForm, type StoredProperty } from './properties';

/** The form's columns, the ones a create or an edit writes (P1-05). */
const ROW_KEYS = [
  'nickname',
  'code',
  'kind',
  'kind_details',
  'use_mode',
  'legal_status',
  'current_address',
  'certificate_address_text',
  'acquired_on',
  'acquisition_kind',
  'acquisition_price_vnd',
  'notes',
] as const;

type RowKey = (typeof ROW_KEYS)[number];
type PropertyColumns = Pick<Tables<'properties'>, RowKey>;
export type PropertySaved = { readonly id: string; readonly nickname: string };
export type CodeTaken = { readonly kind: 'code_taken'; readonly code: string; readonly takenBy: string };

function toRow(input: PropertyInput): PropertyColumns {
  const address = input.current_address;
  const line = address === null ? null : formatCurrentAddress({ houseNo: address.house_no, street: address.street });
  return {
    nickname: input.nickname,
    code: input.code,
    kind: input.kind,
    kind_details: input.kind_details,
    use_mode: input.use_mode,
    legal_status: input.legal_status,
    current_address:
      address === null
        ? null
        : {
            ...(address.house_no === null ? {} : { house_no: address.house_no }),
            ...(address.street === null ? {} : { street: address.street }),
            commune_code: address.commune_code,
            province_code: address.province_code,
            ...(line === null ? {} : { line }),
          },
    certificate_address_text: input.certificate_address_text,
    acquired_on: input.acquired_on,
    acquisition_kind: input.acquisition_kind,
    acquisition_price_vnd: input.acquisition_price_vnd,
    notes: input.notes,
  };
}

const storedAddressSchema = z.object({ house_no: z.string().optional(), street: z.string().optional(), commune_code: z.string(), province_code: z.string() });

/** The stored row as the form would send it, so an edit names only the fields it changes. */
function formOf(row: StoredProperty): Record<string, unknown> {
  const address = storedAddressSchema.safeParse(row.current_address);
  return {
    ...Object.fromEntries(ROW_KEYS.map((key) => [key, row[key]])),
    current_address: address.success
      ? { house_no: address.data.house_no ?? null, street: address.data.street ?? null, commune_code: address.data.commune_code, province_code: address.data.province_code }
      : null,
  };
}

async function wardRefusal(ctx: OpContext, input: PropertyInput): Promise<CommonRefusal | null> {
  const address = input.current_address;
  if (address === null || (await isCommuneOf(ctx.db, address.commune_code, address.province_code))) return null;
  return { kind: 'invalid', issues: [{ path: 'current_address.commune_code', code: 'not_in_province' }] };
}

/** Archived properties keep their code (the unique key covers them), so they count as its holder too. */
async function codeHolder(ctx: OpContext, code: string, except: string): Promise<CodeTaken | null> {
  const { data, error } = await ctx.db.from('properties').select('id, nickname').eq('household_id', ctx.householdId).eq('code', code).neq('id', except).maybeSingle();
  if (error) throw new Error(`Reading the code holder failed: ${error.message}`);
  return data === null ? null : { kind: 'code_taken', code, takenBy: data.nickname };
}

/** Creates the property under the id the caller minted, so planning again after it landed says `unchanged`. */
export const propertyCreate = defineOp({
  creates: 'properties',
  input: z.object({ id: idSchema, property: propertyInputSchema }),
  async plan(ctx, { id, property }) {
    const ward = await wardRefusal(ctx, property);
    if (ward !== null) return refuse(ward);
    const { data: existing, error } = await ctx.db.from('properties').select('id, nickname').eq('household_id', ctx.householdId).eq('id', id).maybeSingle();
    if (error) throw new Error(`Reading the property failed: ${error.message}`);
    if (existing !== null) return unchanged<PropertySaved>(existing);
    const taken = await codeHolder(ctx, property.code, id);
    return taken === null ? change({ id, row: toRow(property) }) : refuse(taken);
  },
  async apply(ctx, { id, row }) {
    const { data, error } = await ctx.db
      .from('properties')
      .insert({ ...row, id, household_id: ctx.householdId })
      .select('id, nickname')
      .single();
    return error ? refuse(dbRefusal(error)) : { ok: true, value: data };
  },
  writes: ({ id, row }) => [{ kind: 'create', table: 'properties', row: { id, nickname: row.nickname } }],
});

/**
 * `set` names the form fields to change; the rest keep their stored values, and the whole is checked as the form
 * checks it. The change lists only the columns that differ, with their values before.
 */
export const propertyEdit = defineOp({
  creates: null,
  input: z.object({ id: idSchema, set: z.partialRecord(z.enum(ROW_KEYS), z.unknown()) }),
  async plan(ctx, { id, set }) {
    const current = await readPropertyForm(ctx.db, ctx.householdId, id);
    if (current === null) return refuse({ kind: 'not_found' });
    const property = propertyInputSchema.safeParse({ ...formOf(current), ...set });
    if (!property.success) return refuse(invalid(property.error));
    const ward = await wardRefusal(ctx, property.data);
    if (ward !== null) return refuse(ward);
    const next = toRow(property.data);
    const keys = ROW_KEYS.filter((key) => !isDeepStrictEqual(current[key], next[key]));
    if (keys.length === 0) return unchanged<PropertySaved>({ id, nickname: current.nickname });
    const taken = keys.includes('code') ? await codeHolder(ctx, next.code, id) : null;
    if (taken !== null) return refuse(taken);
    const pick = (row: PropertyColumns) => Object.fromEntries(keys.map((key) => [key, row[key]])) as Partial<PropertyColumns>;
    return change({ id, before: pick(current), set: pick(next) });
  },
  async apply(ctx, { id, set }) {
    const { data, error } = await ctx.db
      .from('properties')
      .update(set)
      .eq('household_id', ctx.householdId)
      .eq('id', id)
      .is('deleted_at', null)
      .select('id, nickname')
      .maybeSingle();
    if (error) return refuse(dbRefusal(error));
    return data === null ? refuse({ kind: 'not_found' }) : { ok: true, value: data };
  },
});
