import { vnd, type Vnd } from '../money/vnd';
import type { PropertyListRow } from './filters';

export type PropertyTotals = {
  attention: number | null;
  leasedUnits: number;
  units: number;
  rentVnd: Vnd | null;
};

export function propertyTotals(rows: readonly Pick<PropertyListRow, 'statusKeys' | 'leasedUnitCount' | 'unitCount' | 'monthlyRentVnd'>[], attentionKnown: boolean): PropertyTotals {
  const rents = rows.flatMap((row) => (row.monthlyRentVnd === null ? [] : [row.monthlyRentVnd]));
  return {
    attention: !attentionKnown ? null : rows.filter((row) => row.statusKeys.includes('attention')).length,
    leasedUnits: rows.reduce((sum, row) => sum + row.leasedUnitCount, 0),
    units: rows.reduce((sum, row) => sum + row.unitCount, 0),
    rentVnd: rents.length === 0 ? null : vnd(rents.reduce((sum, rent) => sum + rent, 0)),
  };
}
