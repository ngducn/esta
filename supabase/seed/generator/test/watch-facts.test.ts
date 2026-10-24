// Reads the seeded database of the ESTA_SLOT stack after `pnpm db:reset` (the `full` variant): `pnpm seed:facts`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareFacts, WATCH_GOLDEN } from '../../../../apps/agent/test/golden/watch-golden.ts';
import { isoDate } from '../../../../packages/core/src/date/iso-date.ts';
import { evaluateWatch } from '../../../../packages/core/src/watch/index.ts';
import { slotWatchSnapshot, WATCH_FIXTURE, watchFixtureText } from '../../../../scripts/watch-snapshot.ts';
import { householdSeeds } from '../households.ts';

const asOf = isoDate(WATCH_GOLDEN.as_of);
const households = householdSeeds(10);

describe('watch facts on the full seed at 2026-10-07 (AGENT.md §7.1)', () => {
  it('reads the committed snapshot fixture from the demo household; rewrite it with pnpm exec tsx scripts/watch-snapshot.ts', async () => {
    const demo = households.find((household) => household.key === WATCH_GOLDEN.household);
    if (demo === undefined) throw new Error(`No seeded household ${WATCH_GOLDEN.household}`);
    expect(watchFixtureText(await slotWatchSnapshot(demo, asOf))).toBe(readFileSync(WATCH_FIXTURE, 'utf8'));
  });

  it.each(households)('finds the golden facts and no others in $key', async (household) => {
    expect(compareFacts(evaluateWatch(await slotWatchSnapshot(household, asOf)), household.key)).toMatchObject({ missing: [], extra: [] });
  });
});
