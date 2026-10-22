import type { IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';

type Dated = { readonly asOf: IsoDate };

/**
 * The valuation in force on `asOf`: the latest dated on or before it. Two on the same day go to the one listed first,
 * so a read that lists the newest recorded first lets a correction made later that day win. `undefined` when none is.
 */
export function latestValuation<V extends Dated>(valuations: readonly V[], asOf: IsoDate): V | undefined {
  return valuations.reduce<V | undefined>((latest, valuation) => {
    if (valuation.asOf > asOf) return latest;
    return latest === undefined || valuation.asOf > latest.asOf ? valuation : latest;
  }, undefined);
}

/** Annual rent over value, in whole basis points rounded half up: 617.500.000 a year on 9,5 tỷ is 650 (6,5%). */
export function grossYieldBp(annualRentVnd: Vnd, valueVnd: Vnd): number {
  if (valueVnd <= 0) throw new RangeError(`A valuation is above 0, not ${valueVnd}`);
  const value = BigInt(valueVnd);
  return Number((BigInt(annualRentVnd) * 20_000n + value) / (2n * value));
}

export type Portfolio = {
  readonly totalVnd: Vnd;
  /** The oldest of the latest valuations summed, the date the figure is only as fresh as. */
  readonly oldestAsOf: IsoDate;
  readonly valuedCount: number;
  readonly unvaluedCount: number;
};

/**
 * The household's portfolio figure on `asOf` (FIN-5): the sum of each property's latest valuation, with how many
 * properties have none. `null` when no property has one, so Home shows nothing rather than 0.
 */
export function portfolioValue<V extends Dated & { readonly propertyId: string; readonly valueVnd: Vnd }>(
  propertyIds: readonly string[],
  valuations: readonly V[],
  asOf: IsoDate,
): Portfolio | null {
  const latest = propertyIds.flatMap((id) => {
    const found = latestValuation(
      valuations.filter((valuation) => valuation.propertyId === id),
      asOf,
    );
    return found === undefined ? [] : [found];
  });
  const [oldest] = latest.map((valuation) => valuation.asOf).toSorted();
  if (oldest === undefined) return null;
  return {
    totalVnd: vnd(latest.reduce((sum, valuation) => sum + valuation.valueVnd, 0)),
    oldestAsOf: oldest,
    valuedCount: latest.length,
    unvaluedCount: propertyIds.length - latest.length,
  };
}
