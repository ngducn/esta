import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { join } from 'node:path';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';

function authorization(): { authorization: string } {
  const env = slotEnv(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT), { withKeys: false });
  return { authorization: `Bearer ${env.CRON_SECRET}` };
}

function ownTheClockRow() {
  test.skip(test.info().project.name !== 'mobile', 'the test clock row is shared per slot');
}

async function setClock(request: APIRequestContext, frozenNow: string) {
  const response = await request.post('/api/test/clock', { headers: authorization(), data: { frozen_now: frozenNow } });
  expect(response.status()).toBe(200);
}

test('the date line follows the test clock across a day without a restart', async ({ page, request }) => {
  ownTheClockRow();
  try {
    await setClock(request, '2026-10-07T23:59:00+07:00');
    await page.goto('/');
    await expect(page.getByTestId('date-line')).toHaveText('Thứ Tư, 07/10/2026');

    await setClock(request, '2026-10-08T00:00:00+07:00');
    await page.reload();
    await expect(page.getByTestId('date-line')).toHaveText('Thứ Năm, 08/10/2026');

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  } finally {
    await request.delete('/api/test/clock', { headers: authorization() });
  }
});

test('the test clock route refuses a request without the cron secret', async ({ request }) => {
  ownTheClockRow();
  const response = await request.post('/api/test/clock', { data: { frozen_now: '2026-10-10T09:00:00+07:00' } });
  expect(response.status()).toBe(401);
});
