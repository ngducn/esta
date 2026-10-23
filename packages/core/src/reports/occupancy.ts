import { addDays, daysBetween } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import { countCell, textCell, type ExportCell, type ExportTable } from '../export/table';
import { holdsUnit, inEffectOn } from '../lease/current';
import { periodThrough, type ReportSnapshot, type ReportTenancy, type ReportUnit } from './snapshot';

export type OccupancyLabels = {
  readonly place: string;
  readonly occupied: string;
  readonly vacant: string;
  readonly rate: string;
  readonly vacantFor: string;
  readonly total: string;
  readonly placeName: (unit: string, property: string) => string;
  readonly percent: (bp: number) => string;
  readonly leased: string;
  readonly none: string;
};

const collator = new Intl.Collator('vi', { numeric: true });

/**
 * AGENT.md §5.3 W4: how long a unit no lease holds has stood empty on `asOf`, from its last lease's end date, else from
 * `available_from`; `'leased'` while a lease holds it and `null` with no date to count from.
 */
export function vacantDays(unit: ReportUnit, tenancies: readonly ReportTenancy[], asOf: IsoDate): number | 'leased' | null {
  if (tenancies.some((lease) => holdsUnit(lease, asOf))) return 'leased';
  const lastEnd = tenancies.reduce<IsoDate | null>((last, lease) => (lease.end_date !== null && lease.end_date <= asOf && (last === null || lease.end_date > last) ? lease.end_date : last), null);
  const since = lastEnd ?? unit.availableFrom;
  return since === null || since > asOf ? null : daysBetween(since, asOf);
}

/** The unit's days in the period from the first day it could be let, and how many of them a lease was in effect. */
function daysOf(unit: ReportUnit, tenancies: readonly ReportTenancy[], from: IsoDate, through: IsoDate) {
  const starts = [unit.availableFrom, ...tenancies.map((lease) => lease.start_date)].filter((day): day is IsoDate => day !== null).toSorted();
  const first = starts[0] !== undefined && starts[0] > from ? starts[0] : from;
  let counted = 0;
  let occupied = 0;
  for (let day = first; day <= through; day = addDays(day, 1)) {
    counted += 1;
    if (tenancies.some((lease) => inEffectOn(lease, day))) occupied += 1;
  }
  return { counted, occupied };
}

/**
 * FIN-4: for each unit of a live rental property, keyed by its id, the days of the period through `periodThrough` a
 * lease was in effect and the days it stood empty, the share let, and W4's days empty on the Clock's date.
 */
export function occupancy(snapshot: ReportSnapshot, labels: OccupancyLabels): ExportTable {
  const through = periodThrough(snapshot);
  const lines = snapshot.units
    .toSorted((a, b) => collator.compare(a.propertyName, b.propertyName) || collator.compare(a.label, b.label))
    .map((unit) => {
      const tenancies = snapshot.tenancies.filter((lease) => lease.unitId === unit.id);
      return { unit, ...daysOf(unit, tenancies, snapshot.from, through), now: vacantDays(unit, tenancies, snapshot.asOf) };
    });
  const rate = (occupied: number, counted: number): ExportCell => (counted === 0 ? textCell(labels.none) : textCell(labels.percent(Math.round((occupied * 10_000) / counted))));
  const sum = (pick: (line: (typeof lines)[number]) => number) => lines.reduce((total, line) => total + pick(line), 0);
  return {
    columns: [
      { id: 'place', label: labels.place },
      { id: 'occupied', label: labels.occupied },
      { id: 'vacant', label: labels.vacant },
      { id: 'rate', label: labels.rate },
      { id: 'vacantFor', label: labels.vacantFor },
    ],
    rows: lines.map(({ unit, counted, occupied, now }) => ({
      key: unit.id,
      cells: [
        textCell(unit.wholeUnit ? unit.propertyName : labels.placeName(unit.label, unit.propertyName)),
        countCell(occupied),
        countCell(counted - occupied),
        rate(occupied, counted),
        now === 'leased' ? textCell(labels.leased) : now === null ? textCell(labels.none) : countCell(now),
      ],
    })),
    totals: {
      key: 'total',
      cells: [
        textCell(labels.total),
        countCell(sum((line) => line.occupied)),
        countCell(sum((line) => line.counted - line.occupied)),
        rate(
          sum((line) => line.occupied),
          sum((line) => line.counted),
        ),
        textCell(''),
      ],
    },
  };
}
