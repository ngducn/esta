import { parseDecimal } from '../parse/decimal';

const AREA_UNIT = /\s*m(?:²|2)\s*$/u;

/** An area as Mẹ types it, `125,5` or `125,5 m²`, or null when it does not read as a number. Kept free of zod for the browser. */
export function readArea(text: string): number | null {
  const decimal = parseDecimal(text.trim().replace(AREA_UNIT, ''));
  return decimal === null ? null : Number(decimal.digits) / 10 ** decimal.scale;
}

/**
 * DOMAIN-VN §2.1: a parcel's area and the sum of its purposes' areas, when both are known and differ by more than
 * rounding. Both are kept and shown with a warning; neither is corrected.
 */
export function purposeAreaMismatch(parcelArea: number | null, purposeAreas: readonly (number | null)[]): { readonly parcel: number; readonly purposes: number } | null {
  const known = purposeAreas.filter((area): area is number => area !== null);
  if (parcelArea === null || known.length === 0) return null;
  const sum = Math.round(known.reduce((total, area) => total + area, 0) * 100) / 100;
  return Math.abs(sum - parcelArea) >= 0.005 ? { parcel: parcelArea, purposes: sum } : null;
}
