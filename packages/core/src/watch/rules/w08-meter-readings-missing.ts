import { dateParts, firstOfMonth } from '../../date/calendar';
import { inEffect } from '../../lease/current';
import { defineRule } from '../types';

/** After the first days of a month, a meter of a let room in a rooming house with no reading taken this month. */
export const w08MeterReadingsMissing = defineRule({
  id: 'W8',
  scope: 'live',
  thresholds: { afterDayOfMonth: 5 },
  repeat: 'daily',
  find: ({ asOf, properties, units, leases, meters }, { afterDayOfMonth }) => {
    if (dateParts(asOf).day <= afterDayOfMonth) return [];
    const month = firstOfMonth(asOf);
    const roomingHouses = new Set(properties.flatMap((property) => (property.kind === 'rooming_house' ? [property.id] : [])));
    const letUnits = new Set(
      units.flatMap((unit) => (roomingHouses.has(unit.propertyId) && leases.some((lease) => lease.unitId === unit.id && inEffect(lease, asOf)) ? [unit.id] : [])),
    );
    return meters.flatMap((meter) => {
      if (!letUnits.has(meter.unitId) || (meter.lastReadOn !== null && meter.lastReadOn >= month)) return [];
      return [{ subjectKey: `meter:${meter.id}`, severity: 'action', numbers: { month, last_read_on: meter.lastReadOn } }];
    });
  },
});
