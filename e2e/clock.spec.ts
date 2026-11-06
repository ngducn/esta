import { expect, test, type Page } from '@playwright/test';
import { globalClock, lanes, setClock } from './helpers/test-clock';
import { signIn } from './helpers/inbucket';
import { seriousAxeViolations } from './helpers/wizard';

const dateLine = (page: Page) => page.getByTestId('date-line');

function ownTheClockRow() {
  test.skip(test.info().project.name !== 'clock', 'the test clock row is shared per slot');
}

test('the date line follows the test clock across a day without a restart', async ({ page, request }) => {
  ownTheClockRow();
  try {
    await setClock(request, globalClock, '2026-10-07T23:59:00+07:00');
    await signIn(page, 'me.lane4@demo.esta.test');
    await expect(dateLine(page)).toHaveText('Thứ Tư, 07/10/2026');

    await setClock(request, globalClock, '2026-10-08T00:00:00+07:00');
    await page.reload();
    await expect(dateLine(page)).toHaveText('Thứ Năm, 08/10/2026');

    expect(await seriousAxeViolations(page)).toEqual([]);
  } finally {
    await setClock(request, globalClock, null);
  }
});

test('two households frozen on different days each see their own date at the same time', async ({ browser, request }) => {
  ownTheClockRow();
  const other = await browser.newContext();
  try {
    await setClock(request, lanes(4), '2026-10-07T23:59:00+07:00');
    await setClock(request, lanes(1), '2026-11-02T09:00:00+07:00');
    const page = await browser.newPage();
    await signIn(page, 'me.lane4@demo.esta.test');
    const second = await other.newPage();
    await signIn(second, 'me.lane1@demo.esta.test');
    await expect(dateLine(page)).toHaveText('Thứ Tư, 07/10/2026');
    await expect(dateLine(second)).toHaveText('Thứ Hai, 02/11/2026');
    await page.reload();
    await expect(dateLine(page)).toHaveText('Thứ Tư, 07/10/2026');
  } finally {
    await other.close();
    await setClock(request, lanes(1, 4), null);
  }
});

test('the test clock route refuses a request without the cron secret', async ({ request }) => {
  ownTheClockRow();
  const response = await request.post('/api/test/clock', { data: { frozen_now: '2026-10-10T09:00:00+07:00' } });
  expect(response.status()).toBe(401);
});
