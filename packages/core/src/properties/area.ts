import type { Result } from '../result';

export type AreaInputReason = 'empty' | 'invalid' | 'too_precise' | 'too_large';

/** numeric(12,2): at most ten integer digits. */
const MAX_HUNDREDTHS = 999_999_999_999;
const UNIT_SUFFIX = /\s*(?:m²|m2|m)$/i;
const DOT_GROUPED = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/;
const PLAIN = /^(\d+)(?:[.,](\d+))?$/;

/**
 * Reads an area as Vietnamese people write it: `350,5`, `1.250,75 m²`, and also `350.5`. A dot before three-digit
 * groups is thousands grouping; a lone comma or dot is the decimal mark. More than two decimals is refused, because
 * the column keeps hundredths.
 */
export function parseAreaInput(text: string): Result<number, AreaInputReason> {
  const trimmed = text.replace(/[\s ]+/g, ' ').trim().replace(UNIT_SUFFIX, '').replace(/ /g, '');
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

function hundredths(squareMeters: number): number {
  return Math.round(squareMeters * 100);
}

/** Sums in integer hundredths, so `120,5 + 80,25` is exactly `200,75`. A parcel with no area adds nothing. */
export function sumLandArea(parcels: readonly { readonly area_m2: number | null }[]): number {
  return parcels.reduce((total, parcel) => total + (parcel.area_m2 === null ? 0 : hundredths(parcel.area_m2)), 0) / 100;
}

export type PurposesMismatch = { readonly parcel: number; readonly purposes: number };

/**
 * DOMAIN-VN §2.1 keeps both areas when the purposes do not add up to the parcel, and flags it. Nothing to compare
 * when the parcel has no area or no purpose carries one.
 */
export function purposesMismatch(parcel: {
  readonly area_m2: number | null;
  readonly purposes: readonly { readonly area_m2?: number | undefined }[];
}): PurposesMismatch | null {
  const areas = parcel.purposes.flatMap((purpose) => (purpose.area_m2 === undefined ? [] : [hundredths(purpose.area_m2)]));
  if (parcel.area_m2 === null || areas.length === 0) return null;
  const purposes = areas.reduce((total, area) => total + area, 0);
  const area = hundredths(parcel.area_m2);
  return purposes === area ? null : { parcel: area / 100, purposes: purposes / 100 };
}
