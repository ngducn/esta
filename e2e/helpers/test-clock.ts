import { expect, test, type APIRequestContext } from '@playwright/test';
import { join } from 'node:path';
import { parseSlot } from '../../scripts/slot.ts';
import { slotEnv } from '../../scripts/slot-env.ts';
import { laneHousehold } from './seed';
import { START } from './wizard';

/**
 * Which test clock rows a call moves. A spec in a parallel project freezes only the lane households it signs in to
 * (`lanes`), so a spec on other lanes keeps its date. The global row is the one the agent worker and the cron routes
 * read, so only a spec that runs one of them in the `clock` project may use `globalClock` (e2e/clock-scope.test.ts).
 */
export type ClockScope = { readonly kind: 'lanes'; readonly households: readonly string[] } | { readonly kind: 'global' };

export const LANES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const lanes = (...lane: readonly number[]): ClockScope => ({ kind: 'lanes', households: lane.map(laneHousehold) });
export const everyLane = lanes(...LANES);
/** A household a spec made itself, which no lane row covers. */
export const households = (...id: readonly string[]): ClockScope => ({ kind: 'lanes', households: id });
export const globalClock: ClockScope = { kind: 'global' };

const scopeOf = (scope: ClockScope) => (scope.kind === 'global' ? null : scope.households);

/** Freezes the scope's test clock rows, or clears them with null. */
export async function setClock(request: APIRequestContext, scope: ClockScope, frozenNow: string | null) {
  const secret = slotEnv(join(import.meta.dirname, '../..'), parseSlot(process.env.ESTA_SLOT), { withKeys: false }).CRON_SECRET;
  const headers = { authorization: `Bearer ${secret}` };
  const data = frozenNow === null ? { households: scopeOf(scope) } : { frozen_now: frozenNow, households: scopeOf(scope) };
  const response = frozenNow === null ? await request.delete('/api/test/clock', { headers, data }) : await request.post('/api/test/clock', { headers, data });
  expect(response.ok()).toBe(true);
}

/** Runs each test of the spec on SPEC §9.3's day, 2026-10-07 09:00 in Hà Nội. */
export function frozenAtStart(scope: ClockScope) {
  test.beforeEach(async ({ request }) => {
    await setClock(request, scope, START);
  });
  // The next spec in the serial clock project must not meet lanes this one left frozen on SPEC §9.3's day.
  if (scope.kind === 'lanes') {
    test.afterEach(async ({ request }) => {
      await setClock(request, scope, null);
    });
  }
}
