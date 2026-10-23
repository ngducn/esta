import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { householdId, laneSeed, personEmail } from '../../../../supabase/seed/generator/households.ts';

/** Paths relative to apps/web; ARCHITECTURE.md, Integration lanes. */
export const INTEGRATION_LANES: Readonly<Record<string, readonly number[] | 'every-household'>> = {
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
};

export const runsAlone = Object.keys(INTEGRATION_LANES).filter((file) => INTEGRATION_LANES[file] === 'every-household');

const WEB_ROOT = join(import.meta.dirname, '..', '..');

/** The calling file's `index`th lane from INTEGRATION_LANES, with its household id and its two members' emails. */
export function integrationLane(fileUrl: string, index = 0) {
  const file = relative(WEB_ROOT, fileURLToPath(fileUrl)).split(sep).join('/');
  const claim = INTEGRATION_LANES[file];
  const lane = claim === undefined || claim === 'every-household' ? undefined : claim[index];
  if (lane === undefined) throw new Error(`${file} owns no lane at index ${index} in src/test/lanes.ts`);
  const seed = laneSeed(lane);
  return { lane, household: householdId(seed), me: personEmail('me', seed), ryan: personEmail('ryan', seed) };
}
