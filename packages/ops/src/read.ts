import { formatVnd, type Locale } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { compareVietnameseNames } from '@esta/core/names';
import { formatPhone, normalizePhone, type Phone } from '@esta/core/phone';
import { currentAddressText, KIND_FIELDS, searchTokens } from '@esta/core/properties';
import type { Result } from '@esta/core/result';
import { idLast4Schema } from '@esta/core/schemas/party';
import { z } from 'zod';
import type { Db } from './db';
import { readPropertyDetail, searchProperties, type PropertyRow } from './properties';
import { partyRowSchema, type ViewRows } from './view';

export type ReadContext = { readonly db: Db; readonly householdId: string; readonly locale: Locale };

const summary = (row: PropertyRow) => ({
  id: row.id,
  nickname: row.nickname,
  code: row.code,
  kind: row.kind,
  useMode: row.useMode,
  legalStatus: row.legalStatus,
  address: currentAddressText(row),
  certificateAddress: row.certificateAddressText,
  unitCount: row.unitCount,
});

export async function listProperties(ctx: ReadContext) {
  return (await searchProperties(ctx.db, ctx.householdId, [])).map(summary).toSorted((a, b) => a.nickname.localeCompare(b.nickname, 'vi'));
}

/** The property as its detail page reads it, each amount in its kind details beside a display string. Null when the session cannot see it. */
export async function getProperty(ctx: ReadContext, id: string) {
  const property = await readPropertyDetail(ctx.db, ctx.householdId, id);
  if (property === null) return null;
  const amounts = KIND_FIELDS[property.kind].flatMap(({ key, input }) => {
    const amount = property.kindDetails[key];
    return input === 'vnd' && typeof amount === 'number' ? [[`${key}_display`, formatVnd(vnd(amount), ctx.locale)] as const] : [];
  });
  return {
    ...summary(property),
    provinceCode: property.provinceCode,
    legacyProvinceNames: property.legacyProvinceNames,
    location: property.location,
    vacantSince: property.vacantSince,
    kindDetails: { ...property.kindDetails, ...Object.fromEntries(amounts) },
  };
}

const MAX_CANDIDATES = 10;

/** The fields `property_list_rows.search_text` joins, in its order and with the full province name, folded as it folds them. */
const FIELDS: readonly (readonly [string, (row: PropertyRow) => readonly (string | null)[]])[] = [
  ['nickname', (row) => [row.nickname]],
  ['code', (row) => [row.code]],
  ['current address', (row) => [row.addressLine, row.communeName, row.provinceName]],
  ['certificate address', (row) => [row.certificateAddressText]],
];
const LEGACY_NAMES = 'old ward, district or province name';

const searchedText = (parts: readonly (string | null)[]) => searchTokens(parts.filter((part) => part !== null).join(' ')).join(' ');

function reasonsFor(row: PropertyRow, tokens: readonly string[]): string[] {
  const field = (token: string) => FIELDS.find(([, read]) => searchedText(read(row)).includes(token))?.[0] ?? LEGACY_NAMES;
  return [...new Set(tokens.map(field))];
}

/**
 * The rows the property list's search returns for `text`, each with the field every word came from: a word none of the
 * visible fields holds matched a pre-2025 ward, district or province name. An exact code ranks first, then a nickname.
 */
export function rankCandidates(rows: readonly PropertyRow[], text: string) {
  const tokens = searchTokens(text);
  const code = text.trim().toUpperCase();
  const rank = (row: PropertyRow, reasons: readonly string[]) => (row.code === code ? 2 : reasons.includes('nickname') ? 1 : 0);
  return rows
    .map((row) => {
      const reasons = row.code === code ? ['code'] : reasonsFor(row, tokens);
      return { candidate: { id: row.id, nickname: row.nickname, code: row.code, address: currentAddressText(row), reasons }, rank: rank(row, reasons) };
    })
    .toSorted((a, b) => b.rank - a.rank)
    .slice(0, MAX_CANDIDATES)
    .map(({ candidate }) => candidate);
}

export async function findProperty(ctx: ReadContext, text: string) {
  return rankCandidates(await searchProperties(ctx.db, ctx.householdId, searchTokens(text)), text);
}

export const personQuerySchema = z
  .object({ name: z.string().trim().min(1).max(200).optional(), phone: z.string().trim().min(1).max(40).optional(), id_last4: idLast4Schema.optional() })
  .refine((query) => query.name !== undefined || query.phone !== undefined || query.id_last4 !== undefined, { message: 'Give a name, a phone or id_last4.' });

export type PeopleQuery = { readonly tokens: readonly string[]; readonly phone: Phone | null; readonly idLast4: string | null };
export type PersonMatch = 'name' | 'phone' | 'id_last4';

function personMatches(row: ViewRows['parties'], query: PeopleQuery): PersonMatch[] {
  const words = new Set(searchTokens(row.full_name));
  const checks: readonly (readonly [PersonMatch, boolean])[] = [
    ['name', query.tokens.length > 0 && query.tokens.every((token) => words.has(token))],
    ['phone', query.phone !== null && row.phone === query.phone],
    ['id_last4', query.idLast4 !== null && row.id_last4 === query.idLast4],
  ];
  return checks.filter(([, hit]) => hit).map(([match]) => match);
}

/**
 * The people with every word of the name (accents and case aside), the phone, or the last four ID digits, each with
 * what matched and the phone as Vietnamese people write it. Most matches first, then by name.
 */
export function rankPeople(rows: readonly ViewRows['parties'][], query: PeopleQuery) {
  return rows
    .map((row) => ({ row, reasons: personMatches(row, query) }))
    .filter(({ reasons }) => reasons.length > 0)
    .toSorted((a, b) => b.reasons.length - a.reasons.length || compareVietnameseNames(a.row.full_name, b.row.full_name))
    .slice(0, MAX_CANDIDATES)
    .map(({ row, reasons }) => ({ id: row.id, full_name: row.full_name, phone: row.phone === null ? null : formatPhone(row.phone), id_last4: row.id_last4, reasons }));
}

export async function findPerson(ctx: ReadContext, query: z.output<typeof personQuerySchema>): Promise<Result<ReturnType<typeof rankPeople>, 'invalid_phone'>> {
  const phone = query.phone === undefined ? null : normalizePhone(query.phone);
  if (phone !== null && !phone.ok) return { ok: false, reason: 'invalid_phone' };
  const { data, error } = await ctx.db.from('parties').select('id, full_name, phone, id_last4').eq('household_id', ctx.householdId);
  if (error) throw new Error(`Reading the people failed: ${error.message}`);
  const people = partyRowSchema.array().parse(data);
  return { ok: true, value: rankPeople(people, { tokens: searchTokens(query.name ?? ''), phone: phone?.value ?? null, idLast4: query.id_last4 ?? null }) };
}
