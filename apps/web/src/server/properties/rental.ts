import 'server-only';
import { compareUnits } from '@esta/core/properties';
import { UNIT_KINDS, UTILITY_KINDS, type Unit, type UtilityAccount } from '@esta/core/schemas/units';
import { isIsoDate, type IsoDate } from '@esta/core/date';
import { vnd } from '@esta/core/money';
import { cache } from 'react';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

export const UNIT_COLUMNS = 'id, label, kind, area_m2, list_rent_vnd, available_from, sort_order';
export const ACCOUNT_COLUMNS = 'id, unit_id, kind, provider, customer_code, holder_name, note';

const unitRowSchema = z
  .object({
    id: z.uuid(),
    label: z.string(),
    kind: z.enum(UNIT_KINDS),
    area_m2: z.number().nullable(),
    list_rent_vnd: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    available_from: z.string().refine(isIsoDate).nullable(),
    sort_order: z.number().int(),
  })
  .transform(
    (row): Unit => ({
      ...row,
      list_rent_vnd: row.list_rent_vnd === null ? null : vnd(row.list_rent_vnd),
      available_from: row.available_from as IsoDate | null,
    }),
  );

const accountRowSchema = z.object({
  id: z.uuid(),
  unit_id: z.uuid().nullable(),
  kind: z.enum(UTILITY_KINDS),
  provider: z.string().nullable(),
  customer_code: z.string().nullable(),
  holder_name: z.string().nullable(),
  note: z.string().nullable(),
}) satisfies z.ZodType<UtilityAccount>;

export type PropertyRental = { readonly units: readonly Unit[]; readonly accounts: readonly UtilityAccount[] };

/** RLS limits both reads to the member's households and the predicate to the current one. */
export const loadPropertyRental = cache(async (propertyId: string): Promise<PropertyRental> => {
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const scope = { household_id: member.household.id, property_id: propertyId };
  const [units, accounts] = await Promise.all([
    supabase.from('units').select(UNIT_COLUMNS).match(scope),
    supabase.from('utility_accounts').select(ACCOUNT_COLUMNS).match(scope).order('kind').order('created_at').order('id'),
  ]);
  if (units.error) throw new Error(`Reading units failed: ${units.error.message}`);
  if (accounts.error) throw new Error(`Reading utility accounts failed: ${accounts.error.message}`);
  return {
    units: z.array(unitRowSchema).parse(units.data).toSorted(compareUnits),
    accounts: z.array(accountRowSchema).parse(accounts.data),
  };
});

export async function loadUtilityAccount(propertyId: string, accountId: string): Promise<UtilityAccount | null> {
  const { accounts } = await loadPropertyRental(propertyId);
  return accounts.find((account) => account.id === accountId) ?? null;
}
