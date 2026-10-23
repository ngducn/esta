import { publicTable } from './context.ts';
import { householdId, memberId, PEOPLE, personKey } from './households.ts';
import { seedId } from './ids.ts';
import type { HouseholdSeed } from './context.ts';

export function bankPartyId(household: HouseholdSeed) {
  return seedId(`seed:party:bank-${household.key}`);
}

export const parties = publicTable('parties', ({ household }) => [
  ...PEOPLE.map(({ person, fullName, idLast4 }) => ({
    id: seedId(`seed:party:${personKey(person, household)}`),
    household_id: householdId(household),
    kind: 'individual',
    full_name: fullName,
    id_last4: idLast4,
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

/** FIN-3: each owner's other business revenue for 2026, at 0, so the tax card and W7 read a saved row. */
export const ownerTaxInputs = publicTable('owner_tax_inputs', ({ household }) =>
  PEOPLE.map(({ person }) => ({
    id: seedId(`seed:owner-tax-input:${personKey(person, household)}:2026`),
    household_id: householdId(household),
    party_id: seedId(`seed:party:${personKey(person, household)}`),
    year: 2026,
    other_business_revenue_vnd: 0,
  })),
);
