import { addDays } from '../../date/calendar';
import { vacantDays } from '../../reports/occupancy';
import { defineRule } from '../types';

/** A unit of a rental property that no lease holds, empty since its last lease ended or since it became available. */
export const w04Vacancy = defineRule({
  id: 'W4',
  scope: 'live',
  thresholds: { watchAfterDays: 30, actionAfterDays: 90 },
  repeat: 'daily',
  find: ({ asOf, properties, units, leases }, { watchAfterDays, actionAfterDays }) => {
    const rental = new Set(properties.flatMap((property) => (property.useMode === 'rental' ? [property.id] : [])));
    return units.flatMap((unit) => {
      if (!rental.has(unit.propertyId)) return [];
      const days = vacantDays(
        unit,
        leases.filter((lease) => lease.unitId === unit.id),
        asOf,
      );
      if (typeof days !== 'number' || days <= watchAfterDays) return [];
      return [{ subjectKey: `unit:${unit.id}`, severity: days > actionAfterDays ? 'action' : 'watch', numbers: { days_vacant: days, vacant_since: addDays(asOf, -days) } }];
    });
  },
});
