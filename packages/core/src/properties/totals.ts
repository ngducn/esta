import { vnd, type Vnd } from '../money/vnd';
import type { PropertyListRow } from './filters';

export type PropertyTotals = {
  /** Properties with a payment overdue or due. */
  attention: number;
  leasedUnits: number;
  units: number;
  /** The monthly rent owed under the leases in effect; `null` when no property has one, never a false zero. */
  rentVnd: Vnd | null;
};

export function propertyTotals(rows: readonly Pick<PropertyListRow, 'statusKeys' | 'leasedUnitCount' | 'unitCount' | 'monthlyRentVnd'>[]): PropertyTotals {
  const rents = rows.flatMap((row) => (row.monthlyRentVnd === null ? [] : [row.monthlyRentVnd]));
  return {
    attention: rows.filter((row) => row.statusKeys.includes('attention')).length,
    leasedUnits: rows.reduce((sum, row) => sum + row.leasedUnitCount, 0),
    units: rows.reduce((sum, row) => sum + row.unitCount, 0),
    rentVnd: rents.length === 0 ? null : vnd(rents.reduce((sum, rent) => sum + rent, 0)),
  };
}
