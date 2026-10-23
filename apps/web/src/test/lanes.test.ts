import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { seedId } from '../../../../supabase/seed/generator/ids.ts';
import { DEFAULT_OPTIONS } from '../../../../supabase/seed/generator/index.ts';
import { householdId, householdSeeds } from '../../../../supabase/seed/generator/households.ts';
import { INTEGRATION_LANES, integrationLane, runsAlone } from './lanes';

const WEB_ROOT = join(import.meta.dirname, '..', '..');
const onDisk = readdirSync(join(WEB_ROOT, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.integration.test.ts'))
  .map((path) => `src/${path.split('\\').join('/')}`)
  .toSorted();
const claims = Object.entries(INTEGRATION_LANES);
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
    const owned = claims.flatMap(([, claim]) => (claim === 'every-household' ? [] : claim));
    expect(owned.length, 'no lane is owned twice').toBe(new Set(owned).size);
    for (const lane of owned) expect(Number.isInteger(lane) && lane >= 1 && lane <= DEFAULT_OPTIONS.lanes, `lane ${lane}`).toBe(true);
    for (const [file, claim] of claims) expect(claim === 'every-household' || claim.length > 0, file).toBe(true);
  });

  it('runs alone only the files that touch every household', () => {
    expect(runsAlone).toEqual(['src/server/cron/cron.integration.test.ts']);
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
