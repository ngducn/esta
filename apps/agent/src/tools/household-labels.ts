import { readNameLabels } from '@esta/ops';
import type { AgentDb } from '../supabase';
import { foldText, type SearchTerm } from '../sdk/search-guard';
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

/** What a property nickname starts with when it only says what the property is, folded: `Đất Bảo Lộc`, `Căn hộ Q7`. */
const PROPERTY_TYPES: readonly (readonly string[])[] = [
  ...['dat nen', 'dat vuon', 'dat nong nghiep', 'can ho', 'chung cu', 'nha pho', 'nha tro', 'day tro', 'phong tro', 'biet thu', 'mat bang', 'lo dat', 'van phong', 'cua hang', 'dat', 'nha', 'kho', 'shophouse', 'villa'].map((phrase) => phrase.split(' ')),
];

/** A district or ward written short: `Q7`, `P12`, `HCM`. */
const PLACE_ABBREVIATION = /^(?:(?:q|p|h|tp)\s*\d{1,2}|(?:tp\s*)?hcm|sg|hn)$/u;

/** The nickname without the leading words that name what kind of property it is. */
function withoutPropertyType(label: string): string {
  const words = label.trim().split(/\s+/u);
  let start = 0;
  for (let found = true; found && start < words.length; ) {
    const folded = words.slice(start).map(foldText);
    const type = PROPERTY_TYPES.find((phrase) => phrase.every((word, at) => folded[at] === word));
    found = type !== undefined;
    if (type !== undefined) start += type.length;
  }
  return words.slice(start).join(' ');
}

const likeLiteral = (text: string) => text.replace(/[\\%_]/gu, '\\$&');

async function namesAPlace(db: AgentDb, place: string): Promise<boolean> {
  if (PLACE_ABBREVIATION.test(foldText(place))) return true;
  const { data, error } = await db.from('admin_units').select('name').ilike('name', `%${likeLiteral(place)}%`).limit(50);
  if (error) throw new Error(`Reading the administrative units failed: ${error.message}`);
  return data.some(({ name }) => [name, name.replace(PLACE_TYPE, '')].some((candidate) => foldText(candidate) === foldText(place)));
}

/** A nickname is a term when it holds a word of its own: one word, or a type word with a place (`Đất Bảo Lộc`), says nothing about the family. */
async function isFamilyLabel(db: AgentDb, label: string): Promise<boolean> {
  if (label.trim().split(/\s+/u).length < 2) return false;
  const rest = withoutPropertyType(label);
  return rest !== '' && !(await namesAPlace(db, rest));
}

async function readRows<T>(what: string, read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await read(from, from + 999);
    if (error) throw new Error(`Reading the ${what} failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

const filled = (values: readonly (string | null | undefined)[]): string[] => values.filter((value): value is string => typeof value === 'string' && value.trim() !== '');

/**
 * What no web search may hold [app rule] (AGENT.md §6.4): the names of the people in the household's records, the
 * household's name, its property nicknames that say more than a type and a place, and the streets of its addresses.
 * Organizations and place names are not family data.
 */
export async function familySearchTerms(db: AgentDb, householdId: string): Promise<SearchTerm[]> {
  const [{ properties }, parties, accounts, members, household, addresses] = await Promise.all([
    readNameLabels(db, householdId),
    readRows('party names', (from, to) => db.from('parties').select('id, kind, full_name, short_name').eq('household_id', householdId).order('id').range(from, to)),
    readRows('utility account holders', (from, to) => db.from('utility_accounts').select('id, holder_name').eq('household_id', householdId).order('id').range(from, to)),
    readRows('member names', (from, to) => db.from('household_members').select('user_id, display_name').eq('household_id', householdId).order('user_id').range(from, to)),
    db.from('households').select('name').eq('id', householdId),
    db.from('properties').select('current_address').eq('household_id', householdId),
  ]);
  if (household.error) throw new Error(`Reading the household name failed: ${household.error.message}`);
  if (addresses.error) throw new Error(`Reading the property addresses failed: ${addresses.error.message}`);
  const streets = addresses.data.flatMap(({ current_address }) => {
    const street = (current_address as { street?: unknown } | null)?.street;
    return typeof street === 'string' ? [street] : [];
  });
  const people = filled([...parties.filter(({ kind }) => kind !== 'organization').flatMap(({ full_name, short_name }) => [full_name, short_name]), ...accounts.map(({ holder_name }) => holder_name), ...members.map(({ display_name }) => display_name)]);
  const labels = (await Promise.all([...new Set(properties.values())].map(async (label) => ((await isFamilyLabel(db, label)) ? [label] : [])))).flat();
  return [...new Set(people)].map((person): SearchTerm => ({ person })).concat(filled([...labels, ...streets, ...household.data.map(({ name }) => name)]));
}
