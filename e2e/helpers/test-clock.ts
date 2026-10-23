import { expect, test, type APIRequestContext } from '@playwright/test';
import { join } from 'node:path';
import { parseSlot } from '../../scripts/slot.ts';
import { slotEnv } from '../../scripts/slot-env.ts';
import { START } from './wizard';

/** Freezes the slot's shared test clock, or clears it with null. Only specs in the `clock` project may call this. */
export async function setClock(request: APIRequestContext, frozenNow: string | null) {
  const secret = slotEnv(join(import.meta.dirname, '../..'), parseSlot(process.env.ESTA_SLOT), { withKeys: false }).CRON_SECRET;
  const headers = { authorization: `Bearer ${secret}` };
  const response =
    frozenNow === null ? await request.delete('/api/test/clock', { headers }) : await request.post('/api/test/clock', { headers, data: { frozen_now: frozenNow } });
  expect(response.ok()).toBe(true);
}

/** Runs each test of the spec on SPEC §9.3's day, 2026-10-07 09:00 in Hà Nội. */
export function frozenAtStart() {
  test.beforeEach(async ({ request }) => {
    await setClock(request, START);
  });
}
