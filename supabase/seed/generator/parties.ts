import { publicTable } from './context.ts';
import { householdId, memberId, PEOPLE, personKey } from './households.ts';
import { seedId } from './ids.ts';

export const parties = publicTable('parties', ({ household }) =>
  PEOPLE.map(({ person, fullName }) => ({
    id: seedId(`seed:party:${personKey(person, household)}`),
    household_id: householdId(household),
    kind: 'individual',
    full_name: fullName,
    tags: ['owner'],
    member_id: memberId(person, household),
  })),
);
