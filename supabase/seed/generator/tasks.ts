import { publicTable } from './context.ts';
import { householdId } from './households.ts';
import { seedId } from './ids.ts';
import { propertyId } from './units.ts';

/** One task already done, so the checksum covers `tasks` while Home's seeded today list stays as it was. */
export const tasks = publicTable('tasks', ({ household, properties }) => [
  {
    id: seedId(`seed:task:${household.key}:q7-insurance-call`),
    household_id: householdId(household),
    property_id: properties.some(({ key }) => key === 'q7') ? propertyId(household, 'q7') : null,
    title: 'Gọi công ty bảo hiểm hỏi gia hạn bảo hiểm cháy nổ',
    due_on: '2026-10-03',
    status: 'done',
  },
]);
