import { readNameLabels } from '@esta/ops';
import type { AgentDb } from '../supabase';
import { adminUnitNames, readHeldProperties } from './list-properties';

/** The type word a place name starts with, and the number of a ward after it: people say "Thủ Đức" for "Phường Thủ Đức" and "Bảo Lộc" for "Phường 1 Bảo Lộc". */
const PLACE_TYPE = /^(?:Thành phố|Tỉnh|Phường|Xã|Đặc khu|Thị trấn|Quận|Huyện|Thị xã)\s+(?:\d+\s+)?/u;

/**
 * The names the household's own records carry: its property nicknames, unit labels, party names and the place names in
 * its property addresses, each place by its full name and as people say it. A message that holds one names a record, so
 * the language of its words says nothing about the language of the message (#348).
 */
export async function householdLabels(db: AgentDb, householdId: string): Promise<string[]> {
  const [{ properties, units, parties }, held] = await Promise.all([readNameLabels(db, householdId), readHeldProperties(db, householdId)]);
  const places = await adminUnitNames(db, held.flatMap(({ communeCode, provinceCode }) => [communeCode, provinceCode].filter((code) => code !== null)));
  const placeNames = [...places.values()].flatMap((name) => [name, name.replace(PLACE_TYPE, '')]);
  return [...new Set([...properties.values(), ...[...units.values()].map(({ label }) => label), ...parties.values(), ...placeNames])];
}
