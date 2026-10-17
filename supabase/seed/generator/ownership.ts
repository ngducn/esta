import { publicTable } from './context.ts';
import { householdId, PEOPLE, personKey, type Person } from './households.ts';
import { seedId } from './ids.ts';
import { LEGAL_SEEDS } from './legal.ts';
import type { PropertySeedKey } from './properties.ts';

/** SPEC §9.3: Mẹ owns four properties outright, two are 50/50 with Ryan, and Ryan owns `long-an`. */
const OWNERSHIP_SEEDS: Record<PropertySeedKey, Partial<Record<Person, number>>> = {
  q7: { me: 10000 },
  'di-an': { me: 10000 },
  q1: { me: 10000 },
  'bao-loc': { me: 10000 },
  'thu-duc': { me: 5000, ryan: 5000 },
  'bien-hoa': { me: 5000, ryan: 5000 },
  'long-an': { ryan: 10000 },
};

export const ownershipShares = publicTable('ownership_shares', ({ household, properties }) =>
  properties.flatMap(({ key }) =>
    PEOPLE.flatMap(({ person }) => {
      const shareBp = OWNERSHIP_SEEDS[key][person];
      if (shareBp === undefined) return [];
      const certificate = LEGAL_SEEDS[key];
      return [
        {
          id: seedId(`seed:ownership:${household.key}:${key}:${person}`),
          household_id: householdId(household),
          property_id: seedId(`seed:property:${household.key}:${key}`),
          party_id: seedId(`seed:party:${personKey(person, household)}`),
          share_bp: shareBp,
          named_on_certificate: certificate.holders.includes(person),
          since: certificate.issued_on,
        },
      ];
    }),
  ),
);
