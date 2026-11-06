import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { seedId } from '../../../../supabase/seed/generator/ids.ts';
import { DEFAULT_OPTIONS } from '../../../../supabase/seed/generator/index.ts';
import { householdId, householdSeeds } from '../../../../supabase/seed/generator/households.ts';
import { INTEGRATION_LANES, integrationLane, lanesOf, outsiderEmail, runsAlone, runsSerially } from './lanes';

const WEB_ROOT = join(import.meta.dirname, '..', '..');
const onDisk = readdirSync(join(WEB_ROOT, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.integration.test.ts'))
  .map((path) => `src/${path.split('\\').join('/')}`)
  .toSorted();
const claims = Object.entries(INTEGRATION_LANES);
const sourceFiles = readdirSync(join(WEB_ROOT, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.(?:ts|tsx)$/.test(path))
  .map((path) => `src/${path.split('\\').join('/')}`);
const SEEDED_HOUSEHOLDS = householdSeeds(DEFAULT_OPTIONS.lanes).map(householdId);
const fileUrl = (file: string) => pathToFileURL(join(WEB_ROOT, file)).href;

/** What in a file's text names a seeded lane on its own, so the file could sign in or write where another file does. */
function hardCodedLaneRefs(text: string): string[] {
  const patterns = [/\b(?:me|ryan)\.lane(?:\d|\$\{)/g, /seed:household:lane-(?:\d|\$\{)/g];
  return [...patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[0])), ...SEEDED_HOUSEHOLDS.filter((id) => text.includes(id))];
}

describe('the integration lane registry', () => {
  it('names every integration file under src, and only those', () => {
    expect(onDisk.length).toBeGreaterThan(0);
    expect(Object.keys(INTEGRATION_LANES).toSorted()).toEqual(onDisk);
  });

  it('gives each lane to one file, inside the default seed', () => {
    const owned = claims.flatMap(([, claim]) => (Array.isArray(claim) ? claim : []));
    expect(owned.length, 'no lane is owned twice').toBe(new Set(owned).size);
    for (const lane of claims.flatMap(([, claim]) => lanesOf(claim))) expect(Number.isInteger(lane) && lane >= 1 && lane <= DEFAULT_OPTIONS.lanes, `lane ${lane}`).toBe(true);
    for (const [file, claim] of claims) expect(claim === 'every-household' || lanesOf(claim).length > 0, file).toBe(true);
  });

  it('runs the files that share a lane in a pass of their own, and signs the outsider in from a lane no parallel file owns a member of at that time', () => {
    expect(runsSerially.toSorted()).toEqual(claims.filter(([, claim]) => typeof claim === 'object' && 'serial' in claim).map(([file]) => file).toSorted());
    expect(outsiderEmail('me')).toBe('me.lane8@demo.esta.test');
  });

  it('names a file integration whenever it reaches for the local stack, so the database job runs it (#122)', () => {
    const usesStack = sourceFiles.filter((file) => file !== 'src/test/stack.ts' && /from '@\/test\/stack'/.test(readFileSync(join(WEB_ROOT, file), 'utf8')));
    expect(usesStack.length).toBeGreaterThan(0);
    expect(usesStack.filter((file) => !file.endsWith('.integration.test.ts'))).toEqual([]);
  });

  it('runs alone only the files that touch every household', () => {
    expect(runsAlone).toEqual(['src/server/cron/cron.integration.test.ts', 'src/server/cron/document-vault.integration.test.ts']);
  });

  it.each(onDisk)('%s takes its lane from the registry, not a hard-coded email or household', (file) => {
    expect(hardCodedLaneRefs(readFileSync(join(WEB_ROOT, file), 'utf8'))).toEqual([]);
  });

  it('catches each way of naming a lane by hand', () => {
    const lane = 3;
    const lookAlikes = [
      `memberClient('ryan.lane${lane}@demo.esta.test', HOUSEHOLD)`,
      'signedInAs(`me.lane${lane}@demo.esta.test`)',
      `seedId('seed:household:lane-${lane}')`,
      'seedId(`seed:household:lane-${lane}`)',
      `const HOUSEHOLD = '${seedId(`seed:household:lane-${lane}`)}';`,
      `const HOUSEHOLD = '${seedId('seed:household:demo')}';`,
    ];
    for (const text of lookAlikes) expect(hardCodedLaneRefs(text), text).not.toEqual([]);
    expect(hardCodedLaneRefs("const { household, ryan } = integrationLane(import.meta.url); // see 'lane 4'")).toEqual([]);
  });
});

/**
 * The connector's integration files sign in as lane households of their own, and its suite runs on its own through
 * `pnpm --filter connector test:integration`, one file at a time. They name lanes the web registry also owns, so a third
 * suite that named a lane must be listed here with the reason it cannot share a stack with the others (#293).
 */
const OUTSIDE_THE_REGISTRY: Readonly<Record<string, readonly number[]>> = {
  'apps/connector/src/connector.integration.test.ts': [8, 9],
  'apps/connector/src/logout.integration.test.ts': [2],
  'apps/connector/src/rental.integration.test.ts': [8],
};
const REPO_ROOT = join(WEB_ROOT, '..', '..');
const LANE_REF = /lane[.-]?(\d+)/g;

describe('lanes named outside the web registry', () => {
  const files = readdirSync(join(REPO_ROOT, 'apps', 'connector', 'src'), { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts'))
    .map((path) => `apps/connector/src/${path.split('\\').join('/')}`)
    .toSorted();
  const named = Object.fromEntries(
    files.flatMap((file) => {
      const lanes = [...new Set([...readFileSync(join(REPO_ROOT, file), 'utf8').matchAll(LANE_REF)].map((match) => Number(match[1])))].toSorted((a, b) => a - b);
      return lanes.length === 0 ? [] : [[file, lanes]];
    }),
  );

  it('lists every connector file that names a lane, with the lanes it names', () => {
    expect(named).toEqual(OUTSIDE_THE_REGISTRY);
  });

  it('stays inside the default seed', () => {
    for (const lanes of Object.values(OUTSIDE_THE_REGISTRY)) for (const lane of lanes) expect(lane <= DEFAULT_OPTIONS.lanes, `lane ${lane}`).toBe(true);
  });
});

describe('integrationLane', () => {
  it("returns the calling file's lane, its household and its two members", () => {
    expect(integrationLane(fileUrl('src/server/tax/load.integration.test.ts'))).toEqual({
      lane: 2,
      household: seedId('seed:household:lane-2'),
      me: 'me.lane2@demo.esta.test',
      ryan: 'ryan.lane2@demo.esta.test',
    });
    expect(integrationLane(fileUrl('src/server/reports/snapshot.integration.test.ts'), 1).lane).toBe(10);
  });

  it('refuses a file the registry does not name, a lane past its claim, and a file that runs alone', () => {
    expect(() => integrationLane(fileUrl('src/server/new.integration.test.ts'))).toThrow(/owns no lane/);
    expect(() => integrationLane(fileUrl('src/server/tax/load.integration.test.ts'), 1)).toThrow(/owns no lane at index 1/);
    expect(() => integrationLane(fileUrl('src/server/cron/cron.integration.test.ts'))).toThrow(/owns no lane/);
  });
});
