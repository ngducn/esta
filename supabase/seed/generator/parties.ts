import { publicTable } from './context.ts';
import { householdId, memberId, PEOPLE, personKey } from './households.ts';
import { seedId } from './ids.ts';
import type { HouseholdSeed } from './context.ts';

export function bankPartyId(household: HouseholdSeed) {
  return seedId(`seed:party:bank-${household.key}`);
}

export const parties = publicTable('parties', ({ household }) => [
  ...PEOPLE.map(({ person, fullName }) => ({
    id: seedId(`seed:party:${personKey(person, household)}`),
    household_id: householdId(household),
    kind: 'individual',
    full_name: fullName,
    tags: ['owner'],
    member_id: memberId(person, household),
  })),
  {
    id: bankPartyId(household),
    household_id: householdId(household),
    kind: 'organization',
    full_name: 'Ngân hàng Demo',
    tags: ['bank'],
    member_id: null,
  },
]);
