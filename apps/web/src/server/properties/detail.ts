import 'server-only';
import { AUDIT_ACTIONS, AUDIT_ACTOR_KINDS, type ActivityRow } from '@esta/core/activity';
import { parseInstant, type Instant } from '@esta/core';
import { propertyStatus, type PropertyStatusMark, type PropertyViewRow } from '@esta/core/properties';
import { cache } from 'react';
import { z } from 'zod';
import { getClock } from '@/server/clock';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';
import { PROPERTY_ROW_COLUMNS, propertyRowSchema } from './list';

export type PropertyDetail = PropertyViewRow & {
  readonly kindDetails: Readonly<Record<string, unknown>>;
  /** The `propertyStatus` mark on the Clock's date. */
  readonly status: PropertyStatusMark | null;
};

const kindDetailsSchema = z.object({ kind_details: z.record(z.string(), z.unknown()) });

/**
 * The layout and each tab call this for the same id, so `cache` makes it one read per request. RLS limits the row to
 * the member's households and the predicate to the current one, so another household's id returns `null`.
 */
export const loadPropertyDetail = cache(async (id: string): Promise<PropertyDetail | null> => {
  if (!z.uuid().safeParse(id).success) return null;
  const [member, supabase, clock] = await Promise.all([requireMember(), createSessionClient(), getClock()]);
  const [row, details] = await Promise.all([
    supabase.from('property_list_rows').select(PROPERTY_ROW_COLUMNS).eq('household_id', member.household.id).eq('id', id).maybeSingle(),
    supabase.from('properties').select('kind_details').eq('household_id', member.household.id).eq('id', id).maybeSingle(),
  ]);
  if (row.error) throw new Error(`Reading the property failed: ${row.error.message}`);
  if (details.error) throw new Error(`Reading the property details failed: ${details.error.message}`);
  if (row.data === null || details.data === null) return null;
  const property = propertyRowSchema.parse(row.data);
  return { ...property, kindDetails: kindDetailsSchema.parse(details.data).kind_details, status: propertyStatus(property, clock.today()) };
});

const activitySchema = z
  .object({
    id: z.number(),
    at: z.string(),
    action: z.enum(AUDIT_ACTIONS),
    actor_kind: z.enum(AUDIT_ACTOR_KINDS),
    actor_id: z.string(),
    actor_name: z.string().nullable(),
    diff: z.record(z.string(), z.object({ old: z.unknown(), new: z.unknown() })),
  })
  .transform((row): ActivityRow & { readonly id: number; readonly at: Instant } => ({
    id: row.id,
    at: parseInstant(row.at),
    table: 'properties',
    action: row.action,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    actorName: row.actor_name,
    diff: row.diff,
  }));

export type PropertyActivityEntry = z.output<typeof activitySchema>;

export async function loadPropertyActivity(propertyId: string): Promise<PropertyActivityEntry[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc('property_activity', { p_property_id: propertyId, p_limit: 100 });
  if (error) throw new Error(`Reading the property history failed: ${error.message}`);
  return z.array(activitySchema).parse(data);
}
