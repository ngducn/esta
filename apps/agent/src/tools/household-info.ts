import type { AgentDb } from '../supabase';

export type HouseholdInfo = {
  readonly name: string;
  readonly member_count: number;
  readonly property_count: number;
  readonly locale: string;
};

export async function householdInfo(db: AgentDb, householdId: string): Promise<HouseholdInfo> {
  const [household, members, properties] = await Promise.all([
    db.from('households').select('name, locale').eq('id', householdId).single(),
    db.from('household_members').select('id', { count: 'exact', head: true }).eq('household_id', householdId),
    db.from('properties').select('id', { count: 'exact', head: true }).eq('household_id', householdId).is('deleted_at', null),
  ]);
  for (const { error } of [household, members, properties]) {
    if (error) throw new Error(`household_info failed: ${error.message}`);
  }
  if (household.data === null) throw new Error('household_info found no household');
  return {
    name: household.data.name,
    member_count: members.count ?? 0,
    property_count: properties.count ?? 0,
    locale: household.data.locale,
  };
}
