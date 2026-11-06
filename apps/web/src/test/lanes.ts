import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { householdId, laneSeed, personEmail } from '../../../../supabase/seed/generator/households.ts';

/**
 * A file with `{ serial }` lanes shares them with other files, so it runs in a pass of its own after the parallel one,
 * one file at a time.
 */
export type LaneClaim = readonly number[] | 'every-household' | { readonly serial: readonly number[] };

/** Paths relative to apps/web; ARCHITECTURE.md, Integration lanes. */
export const INTEGRATION_LANES: Readonly<Record<string, LaneClaim>> = {
  'src/server/reports/snapshot.integration.test.ts': [1, 10],
  'src/server/tax/load.integration.test.ts': [2],
  'src/server/actions/leases.integration.test.ts': [3],
  'src/server/actions/payments.integration.test.ts': [4],
  'src/server/actions/invoices.integration.test.ts': [5],
  'src/server/actions/deposits.integration.test.ts': [6],
  'src/server/properties/search.integration.test.ts': [7],
  'src/server/actions/statements.integration.test.ts': [8],
  'src/server/actions/meters.integration.test.ts': [9],
  'src/server/cron/cron.integration.test.ts': 'every-household',
  'src/server/expenses/actions.integration.test.ts': { serial: [6] },
  'src/server/properties/wizard.integration.test.ts': { serial: [7] },
  'src/server/documents/actions.integration.test.ts': { serial: [9] },
  'src/server/extraction/actions.integration.test.ts': { serial: [9] },
};

export const runsAlone = Object.keys(INTEGRATION_LANES).filter((file) => INTEGRATION_LANES[file] === 'every-household');
export const runsSerially = Object.keys(INTEGRATION_LANES).filter((file) => typeof INTEGRATION_LANES[file] === 'object' && 'serial' in INTEGRATION_LANES[file]);

export const lanesOf = (claim: LaneClaim): readonly number[] => (claim === 'every-household' ? [] : 'serial' in claim ? claim.serial : claim);

/** A lane whose members the document and extraction tests sign in as, to prove another household gets nothing; the pass that runs them has no file working in it. */
const OUTSIDER_LANE = 8;
export const outsiderEmail = (who: 'me' | 'ryan') => personEmail(who, laneSeed(OUTSIDER_LANE));

const WEB_ROOT = join(import.meta.dirname, '..', '..');

/** The calling file's `index`th lane from INTEGRATION_LANES, with its household id and its two members' emails. */
export function integrationLane(fileUrl: string, index = 0) {
  const file = relative(WEB_ROOT, fileURLToPath(fileUrl)).split(sep).join('/');
  const claim = INTEGRATION_LANES[file];
  const lane = claim === undefined ? undefined : lanesOf(claim)[index];
  if (lane === undefined) throw new Error(`${file} owns no lane at index ${index} in src/test/lanes.ts`);
  const seed = laneSeed(lane);
  return { lane, household: householdId(seed), me: personEmail('me', seed), ryan: personEmail('ryan', seed) };
}

export { withCapabilities } from './fake-member';
