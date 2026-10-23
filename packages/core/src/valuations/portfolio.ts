import type { IsoDate } from '../date/iso-date';
import { scaleRoundHalfUp } from '../money/round';
import { vnd, type Vnd } from '../money/vnd';

type Dated = { readonly asOf: IsoDate };

export function latestValuation<V extends Dated>(newestRecordedFirst: readonly V[], asOf: IsoDate): V | undefined {
  return newestRecordedFirst.reduce<V | undefined>((latest, valuation) => {
    if (valuation.asOf > asOf) return latest;
    return latest === undefined || valuation.asOf > latest.asOf ? valuation : latest;
  }, undefined);
}

export function grossYieldBp(monthlyRentVnd: Vnd, valueVnd: Vnd): number {
  return scaleRoundHalfUp(monthlyRentVnd, 12 * 10_000, valueVnd, 1);
}

export type Portfolio = {
  readonly totalVnd: Vnd;
  readonly oldestAsOf: IsoDate;
  readonly unvaluedCount: number;
};

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
    unvaluedCount: propertyIds.length - latest.length,
  };
}
