import { formatVnd, type Locale } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { currentAddressText, KIND_FIELDS, searchTokens } from '@esta/core/properties';
import { foldVietnamese } from '@esta/core/search';
import type { Db } from './db';
import { readPropertyDetail, searchProperties, type PropertyRow } from './properties';

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

const FIELDS: readonly (readonly [string, (row: PropertyRow) => string | null])[] = [
  ['nickname', (row) => row.nickname],
  ['code', (row) => row.code],
  ['current address', currentAddressText],
  ['certificate address', (row) => row.certificateAddressText],
];
const LEGACY_NAMES = 'old ward, district or province name';

function reasonsFor(row: PropertyRow, tokens: readonly string[]): string[] {
  const field = (token: string) => FIELDS.find(([, read]) => foldVietnamese(read(row) ?? '').includes(token))?.[0] ?? LEGACY_NAMES;
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
