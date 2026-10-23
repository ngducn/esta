import type { IsoDate } from '../date/iso-date';
import { textCell, vndCell, type ExportTable } from '../export/table';
import { rentInEffect } from '../lease/current';
import { vnd, type Vnd } from '../money/vnd';
import { grossYieldBp, latestValuation } from '../valuations/portfolio';
import type { ValuationMethod } from '../valuations/schema';
import type { ReportSnapshot } from './snapshot';

export type PortfolioLabels = {
  readonly property: string;
  readonly value: string;
  readonly valuedOn: string;
  readonly annualRent: string;
  readonly yield: string;
  readonly total: string;
  readonly dated: (date: IsoDate, method: ValuationMethod) => string;
  readonly percent: (bp: number) => string;
  readonly noValuation: string;
  readonly noLease: string;
};

const collator = new Intl.Collator('vi', { numeric: true });

/**
 * FIN-5: one row per live property, keyed by its id: its latest valuation on or before the Clock's date with that date and
 * method, twelve times the monthly rent its leases in effect owe, and the gross yield of the two, as the property's
 * valuation block reads them. The totals add the values and the rents.
 */
export function portfolioSummary(snapshot: ReportSnapshot, labels: PortfolioLabels): ExportTable {
  const { asOf } = snapshot;
  const lines = snapshot.properties
    .toSorted((a, b) => collator.compare(a.name, b.name))
    .map((property) => {
      const latest = latestValuation(
        snapshot.valuations.filter((valuation) => valuation.propertyId === property.id),
        asOf,
      );
      const monthly = rentInEffect(
        snapshot.leases.filter((lease) => lease.property_id === property.id),
        snapshot.schedule,
        asOf,
      );
      return { property, latest, monthly, annualRent: monthly === null ? null : vnd(monthly * 12) };
    });
  const sum = (amounts: readonly (Vnd | null)[]) => vnd(amounts.reduce<number>((total, amount) => total + (amount ?? 0), 0));
  return {
    columns: [
      { id: 'property', label: labels.property },
      { id: 'value', label: labels.value },
      { id: 'valuedOn', label: labels.valuedOn },
      { id: 'annualRent', label: labels.annualRent },
      { id: 'yield', label: labels.yield },
    ],
    rows: lines.map(({ property, latest, monthly, annualRent }) => ({
      key: property.id,
      cells: [
        textCell(property.name),
        latest === undefined ? textCell(labels.noValuation) : vndCell(latest.valueVnd),
        textCell(latest === undefined ? '' : labels.dated(latest.asOf, latest.method)),
        annualRent === null ? textCell(labels.noLease) : vndCell(annualRent),
        textCell(latest === undefined || monthly === null ? '' : labels.percent(grossYieldBp(monthly, latest.valueVnd))),
      ],
    })),
    totals: {
      key: 'total',
      cells: [
        textCell(labels.total),
        vndCell(sum(lines.map((line) => line.latest?.valueVnd ?? null))),
        textCell(''),
        vndCell(sum(lines.map((line) => line.annualRent))),
        textCell(''),
      ],
    },
  };
}
