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
