import type { Result } from '../result';

export type MeasureReason = 'empty' | 'invalid' | 'too_precise' | 'too_large';

/** The units each measure may be typed with, after the number or a space. Both read their number the same way. */
const UNITS = { area: /\s*(?:m²|m2|m)$/i, length: /\s*m$/i } as const;

export type Measure = keyof typeof UNITS;

/** numeric(12,2), the area columns: at most ten integer digits. A length's range is its schema's. */
const MAX_HUNDREDTHS = 999_999_999_999;
const GROUPED = /^(?<integer>\d{1,3}(?<mark>[. \u00A0])\d{3}(?:\k<mark>\d{3})*)(?:,(?<fraction>\d+))?$/u;
const PLAIN = /^(?<integer>\d+)(?:[.,](?<fraction>\d+))?$/u;

/**
 * Reads an area or a length by the DOMAIN-VN §9 rule, such as `350,5`, `1.250,75 m²` or `1 250`. A dot or a space is
 * grouping only before three-digit groups, so `12 5` is never 125, and more than two decimals is refused because the
 * column keeps hundredths, so `4,500` is never 4500.
 */
export function parseMeasureInput(text: string, measure: Measure): Result<number, MeasureReason> {
  const trimmed = text.trim().replace(UNITS[measure], '');
  if (trimmed === '') return { ok: false, reason: 'empty' };
  const match = GROUPED.exec(trimmed) ?? PLAIN.exec(trimmed);
  if (match === null) return { ok: false, reason: 'invalid' };
  const { integer = '', fraction = '' } = match.groups ?? {};
  if (fraction.length > 2) return { ok: false, reason: 'too_precise' };
  const hundredths = Number(integer.replace(/\D/g, '')) * 100 + Number(fraction.padEnd(2, '0'));
  if (hundredths === 0) return { ok: false, reason: 'invalid' };
  if (hundredths > MAX_HUNDREDTHS) return { ok: false, reason: 'too_large' };
  return { ok: true, value: hundredths / 100 };
}

/** A measure as Mẹ types it, `350,5` for 350.5, which `parseMeasureInput` reads back as the same number. */
export const measureInputText = (value: number) => String(value).replace('.', ',');
