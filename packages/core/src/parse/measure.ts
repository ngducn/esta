import type { Result } from '../result';

export type MeasureReason = 'empty' | 'invalid' | 'too_precise' | 'too_large';

/** The units each measure may be typed with. Both read their number the same way. */
const UNITS = { area: /(?:m²|m2|m)$/i, length: /m$/i } as const;

export type Measure = keyof typeof UNITS;

/** numeric(12,2), the area columns: at most ten integer digits. A length's range is its schema's. */
const MAX_HUNDREDTHS = 999_999_999_999;
const DOT_GROUPED = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/;
const PLAIN = /^(\d+)(?:[.,](\d+))?$/;

/**
 * Reads an area or a length as Vietnamese people write it: `350,5`, `1.250,75 m²`, and also `350.5`. A dot before
 * three-digit groups is thousands grouping; a lone comma or dot is the decimal mark. More than two decimals is
 * refused, because the column keeps hundredths, so `4,500` is never read as 4500.
 */
export function parseMeasureInput(text: string, measure: Measure): Result<number, MeasureReason> {
  const trimmed = text.replace(/\s+/g, '').replace(UNITS[measure], '');
  if (trimmed === '') return { ok: false, reason: 'empty' };
  const grouped = DOT_GROUPED.exec(trimmed);
  const match = grouped ?? PLAIN.exec(trimmed);
  if (match === null) return { ok: false, reason: 'invalid' };
  const integer = (match[1] ?? '').replace(/\./g, '');
  const fraction = match[2] ?? '';
  if (fraction.length > 2) return { ok: false, reason: 'too_precise' };
  const hundredths = Number(integer) * 100 + Number(fraction.padEnd(2, '0'));
  if (hundredths === 0) return { ok: false, reason: 'invalid' };
  if (hundredths > MAX_HUNDREDTHS) return { ok: false, reason: 'too_large' };
  return { ok: true, value: hundredths / 100 };
}

/** A measure as Mẹ types it, `350,5` for 350.5, which `parseMeasureInput` reads back as the same number. */
export const measureInputText = (value: number) => String(value).replace('.', ',');
