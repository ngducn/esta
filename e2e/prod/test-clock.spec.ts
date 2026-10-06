import { expect, test } from '@playwright/test';

for (const method of ['post', 'delete'] as const) {
  test(`${method.toUpperCase()} /api/test/clock is 404 with the secret when ESTA_ENV=production`, async ({ request }) => {
    const response = await request[method]('/api/test/clock', {
      headers: { authorization: 'Bearer e2e-cron-secret' },
      data: { frozen_now: '2026-10-10T09:00:00+07:00' },
    });
    expect(response.status()).toBe(404);
  });
}
